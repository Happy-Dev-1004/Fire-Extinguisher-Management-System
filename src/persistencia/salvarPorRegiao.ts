// Persists an AI analysis result onto a pre-seeded extinguisher slot, keyed by
// (regiao + numero_int). This is the regional model: extinguishers already exist
// as empty slots; an inspection FILLS one in and flips its status to
// 'aguardando_verificacao'.
//
// If the caption number is out of range / non-numeric, or the region is unknown,
// the result is parked in inspecoes_pendentes for manual assignment — never lost.

import { supabase } from "../db";
import { logger } from "../logger";
import { resolverNomeRegiao, totalDaRegiao } from "../regioes/regioes";
import type { RespostaIA } from "../analise/schema";

const log = logger.child({ modulo: "persistencia/salvarPorRegiao" });

export interface SalvarRegiaoInput {
  resultado:       RespostaIA;
  loteId:          string;
  fotos:           string[];
  regiaoContexto:  string | null; // region the inspector announced
  numeroLegenda:   string | null; // tag the inspector typed as caption
}

export type SalvarRegiaoResultado =
  | { tipo: "aplicado"; slotId: string; regiao: string; numero: number }
  | { tipo: "pendente"; motivo: string };

export async function salvarPorRegiao(input: SalvarRegiaoInput): Promise<SalvarRegiaoResultado> {
  const { resultado, loteId, fotos, regiaoContexto, numeroLegenda } = input;

  const regiao = await resolverNomeRegiao(regiaoContexto);
  // Prefer the caption number; fall back to whatever the AI read.
  const numStr = numeroLegenda ?? resultado.numero_extintor;
  const numeroInt = parseInteiro(numStr);

  async function parkPendente(motivo: string): Promise<SalvarRegiaoResultado> {
    await supabase.from("inspecoes_pendentes").insert({
      regiao:      regiao ?? regiaoContexto ?? null,
      legenda:     numeroLegenda ?? null,
      numero_lido: numStr ?? null,
      payload:     resultado as any,
      fotos,
      lote_id:     loteId,
    });
    log.warn({ regiao, numStr, motivo }, "inspeção parqueada para atribuição manual");
    return { tipo: "pendente", motivo };
  }

  if (!regiao) {
    return parkPendente("Região não reconhecida — inspetor não informou uma região válida.");
  }
  if (numeroInt === null) {
    return parkPendente(`Número "${numStr}" não é um número de extintor válido.`);
  }
  const total = await totalDaRegiao(regiao);
  if (total !== null && (numeroInt < 1 || numeroInt > total)) {
    return parkPendente(`Número ${numeroInt} fora do intervalo 1..${total} da região ${regiao}.`);
  }

  const { data: slotId, error } = await supabase.rpc("aplicar_inspecao_extintor", {
    p_regiao:             regiao,
    p_numero_int:         numeroInt,
    p_tipo_carga:         resultado.tipo_carga ?? "",
    p_capacidade:         resultado.capacidade ?? "",
    p_vencimento_carga:   resultado.vencimento_carga ?? "",
    p_vencimento_teste:   resultado.vencimento_teste ?? "",
    p_inspetor:           resultado.inspetor ?? "Inspetor não identificado",
    p_lacre:              resultado.lacre,
    p_manometro:          resultado.manometro,
    p_sinalizacao_parede: resultado.sinalizacao_parede,
    p_sinalizacao_piso:   resultado.sinalizacao_piso,
    p_suporte:            resultado.suporte,
    p_mangueira:          resultado.mangueira,
    p_quadro_instrucao:   resultado.quadro_instrucao,
    p_status_geral:       resultado.status_geral ?? "",
    p_observacoes:        resultado.observacoes ?? "",
    p_setor:              resultado.setor ?? "",
    p_fotos:              fotos,
  });

  if (error) {
    log.error({ regiao, numeroInt, err: error.message }, "falha no RPC aplicar_inspecao_extintor");
    return parkPendente(`Erro ao aplicar no slot: ${error.message}`);
  }
  if (!slotId) {
    // No slot matched (shouldn't happen after the range check, but be safe).
    return parkPendente(`Slot ${regiao} #${numeroInt} não encontrado.`);
  }

  log.info({ regiao, numeroInt, slotId }, "inspeção aplicada ao slot — aguardando verificação");
  return { tipo: "aplicado", slotId: slotId as string, regiao, numero: numeroInt };
}

function parseInteiro(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.trim().match(/^0*(\d{1,5})$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
