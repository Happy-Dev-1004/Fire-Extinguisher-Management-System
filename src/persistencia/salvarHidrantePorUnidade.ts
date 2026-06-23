// Persists a hydrant AI result onto a pre-seeded slot, keyed by (unidade +
// numero_int). Mirrors salvarPorRegiao for extinguishers. Out-of-range / unknown
// unit → parked in inspecoes_pendentes_hidrante (never lost).

import { supabaseAdmin as supabase } from "../db-admin";
import { logger } from "../logger";
import { resolverNomeUnidadeHidrante, totalDaUnidadeHidrante } from "../regioes/unidadesHidrante";
import type { RespostaHidrante } from "../analise/schemaHidrante";

const log = logger.child({ modulo: "persistencia/salvarHidrantePorUnidade" });

export interface SalvarHidranteInput {
  resultado:       RespostaHidrante;
  loteId:          string;
  fotos:           string[];
  unidadeContexto: string | null;
  numeroLegenda:   string | null;
}

export type SalvarHidranteResultado =
  | { tipo: "aplicado"; slotId: string; unidade: string; numero: number }
  | { tipo: "pendente"; motivo: string };

function parseInteiro(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.trim().replace(/^h/i, "").match(/^0*(\d{1,5})$/); // tolerate "H01"
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

export async function salvarHidrantePorUnidade(input: SalvarHidranteInput): Promise<SalvarHidranteResultado> {
  const { resultado, loteId, fotos, unidadeContexto, numeroLegenda } = input;

  const unidade = await resolverNomeUnidadeHidrante(unidadeContexto);
  const numStr = numeroLegenda ?? resultado.numero_hidrante;
  const numeroInt = parseInteiro(numStr);

  async function parkPendente(motivo: string): Promise<SalvarHidranteResultado> {
    await supabase.from("inspecoes_pendentes_hidrante").insert({
      unidade:     unidade ?? unidadeContexto ?? null,
      legenda:     numeroLegenda ?? null,
      numero_lido: numStr ?? null,
      payload:     resultado as any,
      fotos,
      lote_id:     loteId,
    });
    log.warn({ unidade, numStr, motivo }, "inspeção de hidrante parqueada");
    return { tipo: "pendente", motivo };
  }

  if (!unidade)        return parkPendente("Unidade não reconhecida — informe uma unidade de hidrante válida.");
  if (numeroInt === null) return parkPendente(`Número "${numStr}" não é um número de hidrante válido.`);
  const total = await totalDaUnidadeHidrante(unidade);
  if (total !== null && (numeroInt < 1 || numeroInt > total)) {
    return parkPendente(`Número ${numeroInt} fora do intervalo 1..${total} da unidade ${unidade}.`);
  }

  const { data: slotId, error } = await supabase.rpc("aplicar_inspecao_hidrante", {
    p_unidade:               unidade,
    p_numero_int:            numeroInt,
    p_inspetor:              resultado.inspetor ?? "Inspetor não identificado",
    p_c_esguicho:            resultado.c_esguicho,
    p_c_condicoes_caixa:     resultado.c_condicoes_caixa,
    p_c_condicoes_acesso:    resultado.c_condicoes_acesso,
    p_c_identificacao_piso:  resultado.c_identificacao_piso,
    p_c_identificacao_placa: resultado.c_identificacao_placa,
    p_c_mangueira:           resultado.c_mangueira,
    p_c_adaptador:           resultado.c_adaptador,
    p_c_chave_storz:         resultado.c_chave_storz,
    p_c_teste:               resultado.c_teste,
    p_c_tampa_hidrante:      resultado.c_tampa_hidrante,
    p_status_geral:          resultado.status_geral ?? "",
    p_observacoes:           resultado.observacoes ?? "",
    p_fotos:                 fotos,
  });

  if (error) {
    log.error({ unidade, numeroInt, err: error.message }, "falha no RPC aplicar_inspecao_hidrante");
    return parkPendente(`Erro ao aplicar no slot: ${error.message}`);
  }
  if (!slotId) return parkPendente(`Slot ${unidade} #${numeroInt} não encontrado.`);

  return { tipo: "aplicado", slotId: slotId as string, unidade, numero: numeroInt };
}
