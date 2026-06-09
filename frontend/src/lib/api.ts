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
  Configuracao,
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
  listar: (unidade?: string) => {
    const qs = unidade ? `?unidade=${encodeURIComponent(unidade)}` : "";
    return request<Extintor[]>("GET", `/extintores${qs}`);
  },

  criar: (body: Omit<Extintor, "id" | "created_at" | "cadastro_pendente">) =>
    request<Extintor>("POST", "/extintores", body),

  atualizar: (id: string, body: Partial<Omit<Extintor, "id" | "created_at">>) =>
    request<Extintor>("PUT", `/extintores/${id}`, body),

  excluir: (id: string) =>
    request<void>("DELETE", `/extintores/${id}`),
};
