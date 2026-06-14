/**
 * Typed API client. All requests go through /api/* which Vite proxies to the
 * Express backend at localhost:3000.
 *
 * getToken() is injected at runtime by AuthContext so every call automatically
 * carries the current Supabase JWT — the backend verifies it via requireAuth.
 */

import type {
  AdminProfile,
  AdminMember,
  Convite,
  Extintor,
  Inspecao,
  Situacao,
  Configuracao,
  Destinatario,
  DestinatarioResolvido,
  ResultadoEnvioMulti,
  FiltrosBusca,
  PaginaBusca,
  RegiaoProgresso,
  CicloAtivo,
  ExtintorRegiao,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE as string ?? "/api";

let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: () => Promise<string | null>) {
  _getToken = fn;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = _getToken ? await _getToken() : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: await authHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      json.erro ?? json.error ?? json.message ?? `Erro HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json as T;
}

// ── /me ──────────────────────────────────────────────────────────────────────

export const meApi = {
  get: () => request<AdminProfile>("GET", "/me"),
};

// ── /equipe ───────────────────────────────────────────────────────────────────

export const equipeApi = {
  listar: () =>
    request<{ admins: AdminMember[]; convites: Convite[] }>("GET", "/equipe"),

  convidar: (email: string) =>
    request<{ mensagem: string; convite: { id: string; email: string; expira_em: string }; link: string }>(
      "POST", "/equipe/convites", { email }
    ),

  revogarConvite: (id: string) =>
    request<{ mensagem: string }>("DELETE", `/equipe/convites/${id}`),

  removerMembro: (id: string) =>
    request<{ mensagem: string }>("DELETE", `/equipe/membros/${id}`),

  transferirPosse: (novo_owner_id: string) =>
    request<{ mensagem: string }>("POST", "/equipe/transferir", { novo_owner_id }),
};

// ── /configuracoes ────────────────────────────────────────────────────────────

export const configApi = {
  listar: () =>
    request<{ configuracoes: Configuracao[] }>("GET", "/configuracoes"),

  atualizar: (nome: string, valor: string) =>
    request<{ mensagem: string; valor_mascarado: string }>(
      "PUT", `/configuracoes/${nome}`, { valor }
    ),
};

// ── /extintores ───────────────────────────────────────────────────────────────

export const extintoresApi = {
  listar: (params?: { unidade?: string; situacao?: Situacao }) => {
    const qs = new URLSearchParams();
    if (params?.unidade)  qs.set("unidade",  params.unidade);
    if (params?.situacao) qs.set("situacao", params.situacao);
    const q = qs.toString();
    return request<{ extintores: Extintor[] }>("GET", `/extintores${q ? `?${q}` : ""}`);
  },

  detalhe: (id: string) =>
    request<{ extintor: Extintor; inspecoes: Inspecao[] }>("GET", `/extintores/${id}`),
};

// ── /inspetores ───────────────────────────────────────────────────────────────

export const inspetoresApi = {
  listar: () =>
    request<{ inspetores: import("./types").Inspetor[] }>("GET", "/inspetores"),

  criar: (body: { nome: string; telefone: string; unidade: string }) =>
    request<import("./types").Inspetor>("POST", "/inspetores", body),

  atualizar: (id: string, body: Partial<{ nome: string; telefone: string; unidade: string; ativo: boolean }>) =>
    request<import("./types").Inspetor>("PUT", `/inspetores/${id}`, body),

  desativar: (id: string) =>
    request<{ mensagem: string }>("DELETE", `/inspetores/${id}`),
};

// ── /destinatarios ────────────────────────────────────────────────────────────

export const destinatariosApi = {
  listar: (unidade?: string) => {
    const qs = unidade ? `?unidade=${encodeURIComponent(unidade)}` : "";
    return request<{ destinatarios: Destinatario[] }>("GET", `/destinatarios${qs}`);
  },

  criar: (body: { nome: string; telefone?: string; email?: string; unidade: string; ativo?: boolean }) =>
    request<Destinatario>("POST", "/destinatarios", body),

  atualizar: (id: string, body: Partial<{ nome: string; telefone: string; email: string; unidade: string; ativo: boolean }>) =>
    request<Destinatario>("PUT", `/destinatarios/${id}`, body),

  remover: (id: string) =>
    request<{ mensagem: string }>("DELETE", `/destinatarios/${id}`),
};

// ── /busca ────────────────────────────────────────────────────────────────────

export const buscaApi = {
  buscar: (filtros: FiltrosBusca) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== undefined && v !== null && v !== "") {
        qs.set(k, String(v));
      }
    }
    const q = qs.toString();
    return request<PaginaBusca>("GET", `/busca${q ? `?${q}` : ""}`);
  },
};

// ── /relatorio ────────────────────────────────────────────────────────────────

async function downloadBlob(path: string, body: unknown, filename: string): Promise<void> {
  const token = _getToken ? await _getToken() : null;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.erro ?? json.error ?? `Erro HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const relatorioApi = {
  ficha: (unidade: string, mes_referencia: string) =>
    downloadBlob(
      "/relatorio/ficha",
      { unidade, mes_referencia },
      `ficha_${unidade.replace(/\s+/g, "_")}_${mes_referencia.replace("/", "-")}.pdf`
    ),

  generico: (filtros: Omit<FiltrosBusca, "page">, formato: "pdf" | "csv" = "pdf") => {
    const ts = new Date().toISOString().slice(0, 10);
    const ext = formato === "csv" ? "csv" : "pdf";
    return downloadBlob(
      "/relatorio/generico",
      { ...filtros, formato },
      `extintores_${ts}.${ext}`
    );
  },

  extintor: (id: string, unidade: string, numero: string) =>
    downloadBlob(
      `/relatorio/extintor/${id}`,
      {},
      `extintor_${unidade.replace(/\s+/g, "_")}_${numero}.pdf`
    ),

  regiao: (regiao: string, formato: "pdf" | "csv" = "pdf") => {
    const ts = new Date().toISOString().slice(0, 10);
    return downloadBlob(
      "/relatorio/regiao",
      { regiao, formato },
      `regiao_${regiao.replace(/\s+/g, "_")}_${ts}.${formato}`
    );
  },
};

// ── /ficha ────────────────────────────────────────────────────────────────────

export const fichaApi = {
  previewDestinatarios: (unidade: string) =>
    request<{ unidade: string; destinatarios: DestinatarioResolvido[] }>(
      "GET", `/ficha/destinatarios?unidade=${encodeURIComponent(unidade)}`
    ),

  enviar: (unidade: string, mes: string, canal: "whatsapp" | "email" | "ambos" = "ambos") =>
    request<{
      mensagem: string;
      enviados: number;
      falhas: number;
      detalhes: ResultadoEnvioMulti[];
    }>("POST", "/ficha/enviar", { unidade, mes, canal }),
};

// ── /regioes ──────────────────────────────────────────────────────────────────

export const regioesApi = {
  listar: () =>
    request<{ regioes: RegiaoProgresso[]; ciclo: CicloAtivo | null }>("GET", "/regioes"),

  extintores: (regiao: string) =>
    request<{ regiao: string; extintores: ExtintorRegiao[] }>(
      "GET", `/regioes/${encodeURIComponent(regiao)}/extintores`
    ),

  obter: (id: string) =>
    request<ExtintorRegiao>("GET", `/regioes/extintor/${id}`),

  editar: (id: string, campos: Partial<ExtintorRegiao>) =>
    request<ExtintorRegiao>("PUT", `/regioes/extintor/${id}`, campos),

  verificar: (id: string, verificado = true) =>
    request<ExtintorRegiao>("POST", `/regioes/extintor/${id}/verificar`, { verificado }),

  novoMes: (mes_referencia: string) =>
    request<{ ciclo_id: string; mes_referencia: string }>("POST", "/regioes/novo-mes", { mes_referencia }),

  seed: () =>
    request<{ inseridos: number }>("POST", "/regioes/seed"),
};
