// System-health & credit tracking for OpenAI and Z-API.
//
// OpenAI has no balance API, so we (a) tally token usage ourselves and alert when
// monthly consumption crosses an owner-set threshold, and (b) intercept the real
// "out of quota / expired" errors (429 insufficient_quota / 401) to fire a
// critical alert the instant it actually fails. Z-API: we check instance status
// and warn ahead of a renewal date the owner stores in settings.
//
// All functions are best-effort and never throw — health monitoring must not
// break the flows it observes.

import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { getSecret } from "../segredos/getSecret";
import { registrarNotificacao } from "./notificacoes";

const log = logger.child({ modulo: "notificacao/saude" });

// Config keys (stored in configuracoes, editable by the owner).
export const CFG_OPENAI_LIMITE_TOKENS = "OPENAI_LIMITE_TOKENS_MES"; // monthly token budget
export const CFG_ZAPI_RENOVA_EM       = "ZAPI_RENOVA_EM";          // YYYY-MM-DD renewal date

const DEFAULT_LIMITE_TOKENS = 2_000_000; // ~R$ a few hundred on gpt-4o; owner can change

// ── Usage tracking ─────────────────────────────────────────────────────────────

export async function registrarUsoOpenAI(input: {
  loteId?: string | null;
  modelo: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): Promise<void> {
  try {
    await supabaseAdmin.from("uso_openai").insert({
      lote_id: input.loteId ?? null,
      modelo: input.modelo,
      prompt_tokens: input.prompt_tokens ?? 0,
      completion_tokens: input.completion_tokens ?? 0,
      total_tokens: input.total_tokens ?? 0,
    });
  } catch (err: any) {
    log.warn({ err: err.message }, "falha ao registrar uso OpenAI (ignorado)");
  }
}

// Sum of tokens used in the current calendar month.
export async function tokensNoMes(): Promise<number> {
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);
  const { data } = await supabaseAdmin
    .from("uso_openai")
    .select("total_tokens")
    .gte("created_at", inicioMes.toISOString());
  return (data ?? []).reduce((s: number, r: any) => s + (Number(r.total_tokens) || 0), 0);
}

async function getConfigNumero(nome: string, fallback: number): Promise<number> {
  const v = await getSecret(nome).catch(() => "");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function getConfigTexto(nome: string): Promise<string | null> {
  const v = await getSecret(nome).catch(() => "");
  return v?.trim() || null;
}

// ── De-dup: fire an alert at most once per cooldown window per key ──────────────

async function jaAlertou(chave: string, cooldownMs: number): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("alertas_estado").select("ultimo_disparo").eq("chave", chave).maybeSingle();
  const ultimo = (data as any)?.ultimo_disparo ? new Date((data as any).ultimo_disparo).getTime() : 0;
  return ultimo > 0 && Date.now() - ultimo < cooldownMs;
}

async function marcarAlerta(chave: string, detalhe: Record<string, unknown> = {}): Promise<void> {
  await supabaseAdmin.from("alertas_estado").upsert(
    { chave, ultimo_disparo: new Date().toISOString(), detalhe, atualizado_em: new Date().toISOString() },
    { onConflict: "chave" }
  );
}

// Clears an alert's state so the NEXT occurrence alerts immediately (no leftover
// cooldown). Called when a service recovers — e.g. Z-API reconnects.
async function limparAlerta(chave: string): Promise<void> {
  await supabaseAdmin.from("alertas_estado").delete().eq("chave", chave);
}

// ── Critical failure interception (called from the API call sites) ─────────────

// True when an OpenAI error means "out of credit / key dead" (vs a transient blip).
export function ehFalhaCriticaOpenAI(err: any): boolean {
  const status = err?.status ?? err?.response?.status;
  const code = err?.code ?? err?.error?.code;
  return status === 401 || status === 429 || code === "insufficient_quota" || code === "invalid_api_key";
}

const COOLDOWN_CRITICO = 6 * 60 * 60 * 1000; // re-alert at most every 6h while broken

export async function alertarFalhaOpenAI(err: any): Promise<void> {
  if (await jaAlertou("openai_falha", COOLDOWN_CRITICO)) return;
  const motivo = err?.code ?? err?.error?.code ?? (err?.status === 429 ? "quota esgotada" : err?.message ?? "erro");
  await registrarNotificacao({
    tipo: "saude",
    severidade: "critico",
    escopo: "owner",
    titulo: "OpenAI indisponível — análise de fotos parada",
    mensagem: `A IA não conseguiu processar (motivo: ${motivo}). Verifique os créditos/chave da OpenAI.`,
    metadata: { servico: "openai", motivo },
  });
  await marcarAlerta("openai_falha", { motivo });
}

export async function alertarFalhaZApi(status: number): Promise<void> {
  if (status !== 401 && status !== 403) return; // only token-dead, not transient
  if (await jaAlertou("zapi_falha", COOLDOWN_CRITICO)) return;
  await registrarNotificacao({
    tipo: "saude",
    severidade: "critico",
    escopo: "owner",
    titulo: "Z-API indisponível — WhatsApp parado",
    mensagem: `O envio de WhatsApp falhou (HTTP ${status}). Verifique o token/assinatura da Z-API.`,
    metadata: { servico: "zapi", status },
  });
  await marcarAlerta("zapi_falha", { status });
}

// Fires when the Z-API instance is reachable but the WhatsApp phone is NOT
// linked (status 200 with connected:false). This is the silent outage that took
// the whole system down: no photo/message reaches the webhook, across ALL phases.
// HTTP 401/403 (token dead) is handled separately by alertarFalhaZApi.
export async function alertarZApiDesconectado(): Promise<void> {
  if (await jaAlertou("zapi_desconectado", COOLDOWN_CRITICO)) return;
  await registrarNotificacao({
    tipo: "saude",
    severidade: "critico",
    escopo: "owner",
    titulo: "Z-API desconectado — WhatsApp fora do ar",
    mensagem:
      "O número de WhatsApp foi desconectado da Z-API. Nenhuma foto ou mensagem dos inspetores " +
      "está chegando (todas as fases). Reconecte em app.z-api.io: escaneie o QR Code no celular " +
      "(WhatsApp → Aparelhos conectados → Conectar um aparelho).",
    metadata: { servico: "zapi", motivo: "desconectado" },
  });
  await marcarAlerta("zapi_desconectado", { motivo: "desconectado" });
}

// ── Periodic checks (run by the hourly job) ────────────────────────────────────

const COOLDOWN_AVISO = 24 * 60 * 60 * 1000; // threshold/expiry warnings at most daily

async function checarLimiteOpenAI(): Promise<void> {
  const limite = await getConfigNumero(CFG_OPENAI_LIMITE_TOKENS, DEFAULT_LIMITE_TOKENS);
  const usados = await tokensNoMes();
  const pct = limite > 0 ? Math.round((usados / limite) * 100) : 0;
  if (pct >= 90 && !(await jaAlertou("openai_limite", COOLDOWN_AVISO))) {
    await registrarNotificacao({
      tipo: "saude",
      severidade: pct >= 100 ? "critico" : "aviso",
      escopo: "owner",
      titulo: `OpenAI: ${pct}% do limite mensal de tokens usado`,
      mensagem: `${usados.toLocaleString("pt-BR")} de ${limite.toLocaleString("pt-BR")} tokens este mês.`,
      metadata: { servico: "openai", usados, limite, pct },
    });
    await marcarAlerta("openai_limite", { pct, usados, limite });
  }
}

async function checarExpiracaoZApi(): Promise<void> {
  const renova = await getConfigTexto(CFG_ZAPI_RENOVA_EM);
  if (!renova) return;
  const dias = Math.ceil((new Date(renova + "T00:00:00Z").getTime() - Date.now()) / 86_400_000);
  // Warn at 7/3/1 days (and overdue). De-dup keys per band so each fires once.
  const band = dias <= 0 ? "vencido" : dias <= 1 ? "1d" : dias <= 3 ? "3d" : dias <= 7 ? "7d" : null;
  if (!band) return;
  const chave = `zapi_expira_${band}`;
  if (await jaAlertou(chave, COOLDOWN_AVISO)) return;
  await registrarNotificacao({
    tipo: "saude",
    severidade: dias <= 1 ? "critico" : "aviso",
    escopo: "owner",
    titulo: dias <= 0 ? "Z-API: assinatura vencida" : `Z-API: assinatura expira em ${dias} dia(s)`,
    mensagem: `Renove a assinatura da Z-API (data informada: ${renova}) para não interromper o WhatsApp.`,
    metadata: { servico: "zapi", renova, dias },
  });
  await marcarAlerta(chave, { dias, renova });
}

// Checks the Z-API instance is actually connected (status endpoint). Best-effort.
async function checarStatusZApi(): Promise<{ conectado: boolean | null }> {
  try {
    const [instanceId, token, clientToken] = await Promise.all([
      getSecret("ZAPI_INSTANCE_ID"), getSecret("ZAPI_TOKEN"), getSecret("ZAPI_CLIENT_TOKEN"),
    ]);
    const res = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/status`,
      { headers: { "Client-Token": clientToken }, signal: AbortSignal.timeout(10_000) }
    );
    if (res.status === 401 || res.status === 403) { await alertarFalhaZApi(res.status); return { conectado: false }; }
    if (!res.ok) return { conectado: null }; // transient/unknown — don't alert
    const body: any = await res.json().catch(() => ({}));
    const conectado = body?.connected === true || body?.smartphoneConnected === true;
    // Instance reachable (200) but the WhatsApp phone is unlinked → silent outage.
    // Alert the owner; clear it on recovery so a future drop re-alerts at once.
    if (conectado) await limparAlerta("zapi_desconectado");
    else           await alertarZApiDesconectado();
    return { conectado };
  } catch {
    return { conectado: null };
  }
}

// Entry point for the hourly job.
export async function rodarChecagemSaude(): Promise<void> {
  try { await checarLimiteOpenAI(); } catch (e: any) { log.warn({ err: e.message }, "checar limite OpenAI falhou"); }
  try { await checarExpiracaoZApi(); } catch (e: any) { log.warn({ err: e.message }, "checar expiração Z-API falhou"); }
  try { await checarStatusZApi(); } catch (e: any) { log.warn({ err: e.message }, "checar status Z-API falhou"); }
}

// ── Snapshot for the dashboard "Saúde do sistema" card (owner-only route) ───────
export interface SaudeSnapshot {
  openai: { tokens_mes: number; limite_mes: number; pct: number; ultima_falha: string | null };
  zapi: { renova_em: string | null; dias_para_renovar: number | null; conectado: boolean | null; ultima_falha: string | null };
}

export async function snapshotSaude(): Promise<SaudeSnapshot> {
  const [limite, usados, renova, status] = await Promise.all([
    getConfigNumero(CFG_OPENAI_LIMITE_TOKENS, DEFAULT_LIMITE_TOKENS),
    tokensNoMes(),
    getConfigTexto(CFG_ZAPI_RENOVA_EM),
    checarStatusZApi(),
  ]);
  const { data: estados } = await supabaseAdmin
    .from("alertas_estado").select("chave, ultimo_disparo").in("chave", ["openai_falha", "zapi_falha", "zapi_desconectado"]);
  const falha = (k: string) => (estados ?? []).find((e: any) => e.chave === k)?.ultimo_disparo ?? null;
  // Z-API "last failure" = whichever of the two failure modes fired most recently.
  const zapiFalha = [falha("zapi_falha"), falha("zapi_desconectado")]
    .filter(Boolean).sort().pop() ?? null;
  const dias = renova ? Math.ceil((new Date(renova + "T00:00:00Z").getTime() - Date.now()) / 86_400_000) : null;
  return {
    openai: {
      tokens_mes: usados,
      limite_mes: limite,
      pct: limite > 0 ? Math.round((usados / limite) * 100) : 0,
      ultima_falha: falha("openai_falha"),
    },
    zapi: {
      renova_em: renova,
      dias_para_renovar: dias,
      conectado: status.conectado,
      ultima_falha: zapiFalha,
    },
  };
}
