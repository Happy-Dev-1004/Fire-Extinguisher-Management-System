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

export interface ItemAtividade {
  tipo: "rdo" | "inspecao";
  id: string;
  data: string | null;
  titulo: string;
  descricao: string;
  status?: string | null;
  link: string;
}

export const meApi = {
  get: () => request<AdminProfile>("GET", "/me"),
  atividadeRecente: () => request<{ itens: ItemAtividade[] }>("GET", "/me/atividade-recente"),
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

async function downloadBlob(
  path: string,
  body: unknown,
  filename: string,
  method: "GET" | "POST" = "POST"
): Promise<void> {
  const token = _getToken ? await _getToken() : null;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
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

// Fetches a report and returns an object URL for INLINE preview (iframe/new
// tab) instead of forcing a download. Caller is responsible for revoking the
// URL when done (URL.revokeObjectURL) to free memory.
async function previewBlob(path: string, body: unknown): Promise<string> {
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
  return URL.createObjectURL(blob);
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

  // Returns a blob URL of the regional PDF for inline preview (no download).
  // preview:true → light PDF without embedded photos, so it renders fast and
  // doesn't time out the browser on large regions.
  regiaoPreview: (regiao: string) =>
    previewBlob("/relatorio/regiao", { regiao, formato: "pdf", preview: true }),
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

  // Manual photo upload — fotos are base64 (data-URI) strings, downscaled
  // client-side before sending. Server stores them in Supabase Storage.
  adicionarFotos: (id: string, fotos: string[]) =>
    request<ExtintorRegiao>("POST", `/regioes/extintor/${id}/fotos`, { fotos }),

  removerFoto: (id: string, url: string) =>
    request<ExtintorRegiao>("DELETE", `/regioes/extintor/${id}/fotos`, { url }),

  novoMes: (mes_referencia: string) =>
    request<{ ciclo_id: string; mes_referencia: string }>("POST", "/regioes/novo-mes", { mes_referencia }),

  seed: () =>
    request<{ inseridos: number }>("POST", "/regioes/seed"),
};

// ── /alarme (Phase 2 — fire-alarm device photographic record) ──────────────────

export interface DispositivoAlarme {
  id: string;
  central_id: string;
  laco: number | null;
  endereco: string | null;
  tipo_dispositivo: string;
  setor: string | null;
  status_instalacao: string;
  data_instalacao: string | null;
  fotos: string[];
}

export interface DispositivoInstalado extends Omit<DispositivoAlarme, "central_id"> {
  central_id?: string;
  qtd_fotos: number;
  link_galeria: string;
}

export interface FotoPendente {
  id: string;
  identificador: string | null;
  central_numero: number | null;
  foto_url: string;
  motivo: string | null;
  resolvido: boolean;
  dispositivo_id: string | null;
  telefone_origem: string | null;
  created_at: string;
}

export interface RelatorioArmazenamento {
  dispositivos_com_foto: number;
  total_fotos_dispositivos: number;
  total_fotos_pendentes: number;
  media_fotos_por_dispositivo: number;
  bytes_estimados: number;
  bytes_legivel: string;
  dispositivos_acima_do_alvo: Array<{ id: string; setor: string | null; endereco: string | null; qtd_fotos: number }>;
  alvo_fotos_por_dispositivo: number;
  nota_arquivamento: string;
}

export const alarmeApi = {
  dispositivo: (id: string) =>
    request<DispositivoAlarme>("GET", `/alarme/dispositivos/${id}`),

  instaladosEm: (data: string, central_numero?: number) => {
    const qs = new URLSearchParams({ data });
    if (central_numero) qs.set("central_numero", String(central_numero));
    return request<{ data: string; total: number; dispositivos: DispositivoInstalado[] }>(
      "GET", `/alarme/dispositivos-instalados?${qs.toString()}`
    );
  },

  adicionarFotos: (id: string, fotos: string[]) =>
    request<DispositivoAlarme>("POST", `/alarme/dispositivos/${id}/fotos`, { fotos }),

  removerFoto: (id: string, url: string) =>
    request<DispositivoAlarme>("DELETE", `/alarme/dispositivos/${id}/fotos`, { url }),

  fotosPendentes: (resolvido = false) =>
    request<{ pendentes: FotoPendente[] }>("GET", `/alarme/fotos-pendentes?resolvido=${resolvido}`),

  atribuirPendente: (id: string, dispositivo_id: string) =>
    request<{ ok: boolean }>("POST", `/alarme/fotos-pendentes/${id}/atribuir`, { dispositivo_id }),

  armazenamento: () =>
    request<RelatorioArmazenamento>("GET", "/alarme/armazenamento"),

  progresso: () =>
    request<RelatorioProgresso>("GET", "/alarme/progresso"),

  busca: (filtros: FiltrosAlarme) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const q = qs.toString();
    return request<PaginaBuscaAlarme>("GET", `/alarme/busca${q ? `?${q}` : ""}`);
  },

  buscaRelatorio: (filtros: Omit<FiltrosAlarme, "page">, formato: "pdf" | "csv" = "pdf") => {
    const qs = new URLSearchParams({ formato });
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const ts = new Date().toISOString().slice(0, 10);
    return downloadBlob(`/alarme/busca/relatorio?${qs.toString()}`, undefined, `dispositivos_${ts}.${formato}`, "GET");
  },
};

export interface ContagemStatus {
  pendente: number; instalado: number; enderecado: number; testado: number;
  total: number; pct_instalado: number; pct_testado: number;
}
export interface GrupoLaco { laco: number | null; contagem: ContagemStatus; }
export interface GrupoCentral {
  central_numero: number | null; central_nome: string | null;
  contagem: ContagemStatus; lacos: GrupoLaco[];
}
export interface LinhaReconciliacao {
  tipo: string; label: string; cadastrados: number; esperado: number;
  faltam: number; excedente: number; completo: boolean;
}
export interface RelatorioProgresso {
  geral: ContagemStatus;
  centrais: GrupoCentral[];
  reconciliacao: {
    linhas: LinhaReconciliacao[];
    total_cadastrados: number; total_esperado: number; total_faltam: number; completo: boolean;
  };
  total_esperado: number;
}

export interface FiltrosAlarme {
  central_numero?: number; laco?: number; tipo_dispositivo?: string;
  setor?: string; status_instalacao?: string; cadastro_pendente?: string;
  com_foto?: string; page?: number;
}
export interface DispositivoBusca {
  id: string; central_numero: number | null; central_nome: string | null;
  laco: number | null; endereco: string | null; tipo_dispositivo: string; tipo_label: string;
  setor: string | null; status_instalacao: string; status_label: string;
  data_instalacao: string | null; cadastro_pendente: boolean; qtd_fotos: number;
}
export interface PaginaBuscaAlarme {
  resultados: DispositivoBusca[]; total: number; pagina: number; total_paginas: number;
  contagens: { total: number; pendente: number; instalado: number; enderecado: number; testado: number; cadastro_pendente: number };
}

// ── RDO send + PDF ──────────────────────────────────────────────────────────

export interface RdoRow {
  id: string; data: string | null; responsavel: string | null; periodo: string | null;
  central: string | null; frente_trabalho: string | null; status: string | null;
  dispositivos_instalados: Record<string, number> | null; fotos_dia: string[] | null;
  created_at: string;
}

export const rdosApi = {
  listar: (filtros?: { status?: string; data?: string }) => {
    const qs = new URLSearchParams();
    if (filtros?.status) qs.set("status", filtros.status);
    if (filtros?.data) qs.set("data", filtros.data);
    const q = qs.toString();
    return request<{ rdos: RdoRow[] }>("GET", `/rdos${q ? `?${q}` : ""}`);
  },

  destinatarios: () =>
    request<{ unidade: string; destinatarios: DestinatarioResolvido[] }>("GET", "/rdos/destinatarios"),

  pdfUrl: (id: string) => `${BASE}/rdos/${id}/pdf`,

  baixarPdf: (id: string, data: string | null) =>
    downloadBlob(`/rdos/${id}/pdf`, undefined, `rdo_${(data ?? "sem-data").replace(/\//g, "-")}.pdf`, "GET"),

  enviar: (id: string, canal: "whatsapp" | "email" | "ambos") =>
    request<{ mensagem: string; enviados: number; falhas: number; detalhes: unknown[] }>(
      "POST", `/rdos/${id}/enviar`, { canal }
    ),

  relatorio: (filtros: { status?: string; mes?: string; data?: string }, formato: "pdf" | "csv" = "pdf") => {
    const qs = new URLSearchParams({ formato });
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const ts = new Date().toISOString().slice(0, 10);
    return downloadBlob(`/rdos/relatorio?${qs.toString()}`, undefined, `rdos_${ts}.${formato}`, "GET");
  },
};
