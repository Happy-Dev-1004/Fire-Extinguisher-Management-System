import { supabase } from "../db";
import { logger } from "../logger";
import type { RespostaIA } from "../analise/schema";

export interface EntradaSalvar {
  resultado: RespostaIA;
  loteId: string;
  fotos: string[];
  unidadeContexto: string; // site determined by caller (from phone→site mapping)
  mesReferencia: string;   // e.g. "Junho/2026"
  dataInspecao: string;    // ISO date "YYYY-MM-DD"
}

const CHECKLIST_ITENS = [
  "lacre",
  "vencimento_carga_status",
  "vencimento_teste_status",
  "manometro",
  "sinalizacao_parede",
  "sinalizacao_piso",
  "suporte",
  "mangueira",
  "quadro_instrucao",
] as const;

function temIrregularidade(resultado: RespostaIA): boolean {
  return CHECKLIST_ITENS.some((item) => resultado[item] === "Reprovado");
}

// Only include fields that are non-empty strings so we never overwrite
// good existing data with null/empty values from a low-confidence AI read.
function camposRegistroNaoVazios(
  resultado: RespostaIA,
  unidade: string
): Record<string, string> {
  const campos: Record<string, string> = { unidade };
  if (resultado.setor)           campos.setor           = resultado.setor;
  if (resultado.tipo_carga)      campos.tipo_carga      = resultado.tipo_carga;
  if (resultado.capacidade)      campos.capacidade      = resultado.capacidade;
  if (resultado.vencimento_carga) campos.vencimento_carga = resultado.vencimento_carga;
  if (resultado.vencimento_teste) campos.vencimento_teste = resultado.vencimento_teste;
  return campos;
}

export async function salvarResultado(entrada: EntradaSalvar): Promise<void> {
  const { resultado, loteId, fotos, unidadeContexto, mesReferencia, dataInspecao } = entrada;
  const numero = resultado.numero_extintor;
  const unidade = resultado.unidade ?? unidadeContexto;
  const log = logger.child({ loteId, numero, unidade });

  // ── Step 1: registry upsert ──────────────────────────────────────────────
  // Look up the extinguisher by its natural key (numero + unidade)
  const { data: existente, error: buscaError } = await supabase
    .from("extintores")
    .select("id, cadastro_pendente")
    .eq("numero", numero)
    .eq("unidade", unidade)
    .maybeSingle();

  if (buscaError) {
    log.error({ err: buscaError.message }, "falha ao buscar extintor no cadastro");
    throw new Error(`Falha na busca do cadastro: ${buscaError.message}`);
  }

  if (existente) {
    // Known extinguisher: update only non-empty fields
    const updates = camposRegistroNaoVazios(resultado, unidade);
    const { error: updateError } = await supabase
      .from("extintores")
      .update(updates)
      .eq("id", existente.id);

    if (updateError) {
      log.error({ err: updateError.message }, "falha ao atualizar cadastro do extintor");
      throw new Error(`Falha na atualização do cadastro: ${updateError.message}`);
    }
    log.info({ campos: Object.keys(updates) }, "cadastro do extintor atualizado");
  } else {
    // Unknown extinguisher: create a pending registry row — do not block inspection
    const { error: insertError } = await supabase
      .from("extintores")
      .insert({
        numero,
        unidade,
        setor:            resultado.setor            ?? "",
        tipo_carga:       resultado.tipo_carga,
        capacidade:       resultado.capacidade       ?? "",
        vencimento_carga: resultado.vencimento_carga ?? "",
        vencimento_teste: resultado.vencimento_teste ?? "",
        cadastro_pendente: true,
      });

    if (insertError) {
      log.error({ err: insertError.message }, "falha ao criar cadastro pendente");
      throw new Error(`Falha ao criar cadastro pendente: ${insertError.message}`);
    }
    log.warn("extintor não encontrado no cadastro — registro pendente criado");
  }

  // ── Step 2: inspection upsert (idempotent via lote_id unique constraint) ──
  // NOTE on transaction integrity: Supabase (PostgREST) does not expose
  // multi-statement transactions over the REST API. We mitigate partial
  // failure by ordering writes: registry first, then inspection. If the
  // inspection write fails after a successful registry update, the next
  // retry will find the registry already correct (update is idempotent)
  // and will upsert the inspection cleanly. The lote_id unique constraint
  // ensures the inspection is never duplicated across retries.
  const irregularidade = temIrregularidade(resultado);

  const inspecaoPayload = {
    extintor_numero:      numero,
    extintor_unidade:     unidade,
    mes_referencia:       mesReferencia,
    data_inspecao:        dataInspecao,
    inspetor:             resultado.inspetor ?? "Inspetor não identificado",
    lacre:                resultado.lacre,
    vencimento_carga:     resultado.vencimento_carga_status,
    vencimento_teste:     resultado.vencimento_teste_status,
    manometro:            resultado.manometro,
    sinalizacao_parede:   resultado.sinalizacao_parede,
    sinalizacao_piso:     resultado.sinalizacao_piso,
    suporte:              resultado.suporte,
    mangueira:            resultado.mangueira,
    quadro_instrucao:     resultado.quadro_instrucao,
    status_geral:         resultado.status_geral,
    observacoes:          resultado.observacoes,
    fotos,
    lote_id:              loteId,
    tem_irregularidade:   irregularidade,
  };

  const { error: upsertError } = await supabase
    .from("inspecoes")
    .upsert(inspecaoPayload, { onConflict: "lote_id" });

  if (upsertError) {
    log.error({ err: upsertError.message }, "falha ao salvar inspeção");
    throw new Error(`Falha ao salvar inspeção: ${upsertError.message}`);
  }

  log.info(
    { tem_irregularidade: irregularidade, status_geral: resultado.status_geral },
    irregularidade
      ? "inspeção salva — IRREGULARIDADE detectada, aguardando alerta"
      : "inspeção salva com sucesso"
  );
}
