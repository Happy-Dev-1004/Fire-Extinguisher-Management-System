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

export async function notificarInspetorPorLote(entrada: EntradaNotificacao): Promise<void> {
  const { loteId, phone, resultado, unidade } = entrada;
  const log = logger.child({ loteId, phone, extintor: resultado.numero_extintor });

  // Idempotency check
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

  const texto = montarMensagemConfirmacao(resultado, unidade);
  log.info("enviando confirmação WhatsApp ao inspetor");

  const enviado = await sendWhatsAppMessage(phone, texto);

  if (!enviado) {
    log.error("falha ao enviar confirmação — sendWhatsAppMessage retornou false");
    return;
  }

  const { error: updateError } = await supabase
    .from("lotes_fotos")
    .update({ notificado: true })
    .eq("id", loteId);

  if (updateError) {
    log.error({ err: updateError.message }, "confirmação enviada mas falha ao marcar notificado=true");
  } else {
    log.info("confirmação enviada ao inspetor");
  }
}
