import { supabase } from "../db";
import { logger } from "../logger";
import type { RespostaIA } from "../analise/schema";
import { montarMensagemConfirmacao } from "./mensagem";
import { sendWhatsAppMessage } from "./zapi";

export interface EntradaNotificacao {
  loteId: string;
  phone: string;
  resultado: RespostaIA;
  unidade: string;
}

/**
 * Sends exactly one WhatsApp confirmation per processed batch.
 * Idempotency is enforced by the `notificado` flag on lotes_fotos:
 * - If already true, skip silently.
 * - If false, send the message, then set the flag.
 * The flag is set only after a successful send, so a send failure
 * leaves it false and allows a future retry — but the inspection
 * record is never at risk regardless of what happens here.
 */
export async function notificarInspetorPorLote(entrada: EntradaNotificacao): Promise<void> {
  const { loteId, phone, resultado, unidade } = entrada;
  const log = logger.child({ modulo: "notificacao", loteId, phone });

  // ── Idempotency check ────────────────────────────────────────────────────────
  const { data: lote, error: fetchError } = await supabase
    .from("lotes_fotos")
    .select("notificado")
    .eq("id", loteId)
    .maybeSingle();

  if (fetchError) {
    log.error({ err: fetchError.message }, "falha ao verificar flag notificado — confirmação cancelada");
    return;
  }

  if (!lote) {
    log.warn("lote não encontrado ao tentar enviar confirmação");
    return;
  }

  if (lote.notificado === true) {
    log.info("lote já notificado — confirmação ignorada");
    return;
  }

  // ── Build and send ───────────────────────────────────────────────────────────
  const texto = montarMensagemConfirmacao(resultado, unidade);
  log.info({ extintor: resultado.numero_extintor }, "enviando confirmação ao inspetor");

  const enviado = await sendWhatsAppMessage(phone, texto);

  if (!enviado) {
    // sendWhatsAppMessage already logged the error — do not rethrow.
    // The inspection is saved; only the notification failed.
    return;
  }

  // ── Mark as notified ─────────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("lotes_fotos")
    .update({ notificado: true })
    .eq("id", loteId);

  if (updateError) {
    // Notification was sent but the flag failed to set.
    // Log clearly so an operator can manually reset if needed;
    // the next reprocess attempt will re-send, which is the safer failure mode.
    log.error(
      { err: updateError.message },
      "confirmação enviada mas falha ao marcar notificado=true — próximo reprocessamento pode reenviar"
    );
  } else {
    log.info("flag notificado=true persistida com sucesso");
  }
}
