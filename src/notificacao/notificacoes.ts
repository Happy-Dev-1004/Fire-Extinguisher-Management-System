// In-app notification center + critical-alert fan-out.
//
// registrarNotificacao() records an event in the `notificacoes` table (the bell).
// Photo events collapse onto a single rolling row per session/region via
// grupo_chave (so the bell never floods). Critical alerts (OpenAI/Z-API health)
// additionally push to the OWNER through whatever channel still works — email is
// the failure-proof path, since a dead Z-API can't carry its own alert.
//
// Never throws: a notification failing must never break the flow that emitted it.

import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";

const log = logger.child({ modulo: "notificacao/notificacoes" });

export type Severidade = "info" | "sucesso" | "aviso" | "critico";
export type Escopo = "owner" | "admin";

export interface NotificacaoInput {
  tipo: string;                 // 'sessao' | 'foto' | 'instalacao' | 'rdo' | 'saude'
  titulo: string;
  mensagem?: string;
  severidade?: Severidade;      // default 'info'
  escopo?: Escopo;              // default 'admin' (owner+members); 'owner' = owner only
  metadata?: Record<string, unknown>;
  // When set, a new event with the same grupo_chave UPDATES the open (unread) row
  // instead of inserting — used to collapse high-volume photo notifications.
  grupoChave?: string;
}

// Records (or collapses) one notification. Returns the row id, or null on failure.
export async function registrarNotificacao(input: NotificacaoInput): Promise<string | null> {
  const severidade = input.severidade ?? "info";
  const escopo = input.escopo ?? "admin";
  const agora = new Date().toISOString();

  try {
    // ── Collapse path: fold into the current open group if one exists ──────────
    if (input.grupoChave) {
      const { data: aberta } = await supabaseAdmin
        .from("notificacoes")
        .select("id, contador")
        .eq("grupo_chave", input.grupoChave)
        .eq("lida", false)
        .maybeSingle();

      if (aberta) {
        await supabaseAdmin
          .from("notificacoes")
          .update({
            titulo: input.titulo,
            mensagem: input.mensagem ?? null,
            metadata: input.metadata ?? {},
            contador: (aberta as any).contador + 1,
            atualizado_em: agora,
          })
          .eq("id", (aberta as any).id);
        return (aberta as any).id as string;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("notificacoes")
      .insert({
        tipo: input.tipo,
        severidade,
        titulo: input.titulo,
        mensagem: input.mensagem ?? null,
        metadata: input.metadata ?? {},
        grupo_chave: input.grupoChave ?? null,
        escopo,
        atualizado_em: agora,
      })
      .select("id")
      .single();

    if (error) {
      log.error({ err: error.message, tipo: input.tipo }, "falha ao registrar notificação");
      return null;
    }

    // ── Critical fan-out: also reach the owner off-dashboard ───────────────────
    if (severidade === "critico") {
      // Fire-and-forget; never block the caller and never throw.
      void fanoutCritico(input).catch((e) =>
        log.error({ err: e?.message }, "falha no fan-out de alerta crítico")
      );
    }

    return (data as any).id as string;
  } catch (err: any) {
    log.error({ err: err.message, tipo: input.tipo }, "erro ao registrar notificação");
    return null;
  }
}

// Sends a critical alert to the owner by email (failure-proof) and WhatsApp (when
// available). Imported lazily to avoid a heavy import graph on every emit.
async function fanoutCritico(input: NotificacaoInput): Promise<void> {
  const assunto = `🔴 Alerta do sistema: ${input.titulo}`;
  const corpo = `${input.titulo}${input.mensagem ? `\n\n${input.mensagem}` : ""}`;

  // Resolve the owner's contact.
  const { data: owner } = await supabaseAdmin
    .from("admins")
    .select("email, nome")
    .eq("role", "owner")
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  // Email path (works even if Z-API is the thing that died).
  if ((owner as any)?.email) {
    try {
      const { enviarEmailSimples } = await import("./enviarEmailSimples");
      await enviarEmailSimples((owner as any).email, assunto, corpo);
    } catch (e: any) {
      log.warn({ err: e?.message }, "fan-out crítico: e-mail falhou");
    }
  }

  // WhatsApp path to the configured bot/owner number (best-effort; may be the
  // dead channel, which is exactly why email above is the primary path).
  try {
    const { getSecret } = await import("../segredos/getSecret");
    const numero = await getSecret("WHATSAPP_NUMERO").catch(() => "");
    if (numero) {
      const { sendWhatsAppMessage } = await import("./zapi");
      await sendWhatsAppMessage(numero, `🔴 *Alerta do sistema*\n${corpo}`);
    }
  } catch (e: any) {
    log.warn({ err: e?.message }, "fan-out crítico: WhatsApp falhou");
  }
}
