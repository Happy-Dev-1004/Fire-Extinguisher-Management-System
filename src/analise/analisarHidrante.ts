// Phase 3 (hydrant) photo-album analysis — mirrors analisar.ts (extinguishers).
// The webhook tags a batch with fase='hidrante'; the dispatcher routes it here.

import OpenAI from "openai";
import { supabase } from "../db";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { RespostaHidranteSchema, type RespostaHidrante } from "./schemaHidrante";
import { SYSTEM_PROMPT_HIDRANTE, buildUserMessageHidrante } from "./promptHidrante";
import { extrairNumeroTag, type LoteFotos } from "./analisar";
import { salvarHidrantePorUnidade, buscarConstantesHidrante } from "../persistencia/salvarHidrantePorUnidade";
import { sendWhatsAppMessage } from "../notificacao/zapi";
import { variantesTelefone } from "../inspetores/normalizar";
import { getSecret } from "../segredos/getSecret";
import { registrarUsoOpenAI, ehFalhaCriticaOpenAI, alertarFalhaOpenAI } from "../notificacao/saude";

const MIN_FOTOS = 1;

async function getUnidadeInspetor(phone: string): Promise<string | null> {
  const variantes = variantesTelefone(phone);
  if (variantes.length === 0) return null;
  const { data } = await supabaseAdmin
    .from("inspetores")
    .select("unidade_contexto")
    .in("telefone_normalizado", variantes)
    .eq("ativo", true)
    .limit(1);
  const u = (data?.[0] as any)?.unidade_contexto?.trim();
  return u || null;
}

async function getOpenAI(): Promise<OpenAI> {
  return new OpenAI({ apiKey: await getSecret("OPENAI_API_KEY") });
}

function limparFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export async function analisarLoteHidrante(lote: LoteFotos): Promise<RespostaHidrante | null> {
  const log = logger.child({ loteId: lote.id, hidrante: lote.legenda, phone: lote.phone, fase: "hidrante" });

  if (lote.status !== "pronto") {
    log.info({ status: lote.status }, "lote ignorado — status não é 'pronto'");
    return null;
  }
  if (lote.fotos.length < MIN_FOTOS) {
    await supabase.from("lotes_fotos").update({ status: "lote_incompleto" }).eq("id", lote.id);
    return null;
  }

  // Optimistic lock (same as extinguishers).
  const { error: lockError } = await supabase
    .from("lotes_fotos").update({ status: "processando" }).eq("id", lote.id).eq("status", "pronto");
  if (lockError) {
    log.error({ err: lockError.message }, "falha ao bloquear lote para análise");
    return null;
  }

  // Resolve the unit + slot constants BEFORE the AI call so we can tell the model
  // what this specific hydrant should have (e.g. 2 nozzles, 4 hoses, 2 wrenches).
  // Verifying against a known expectation is far more reliable than identifying
  // the small accessories blind. Best-effort: if it can't be resolved, the prompt
  // just omits the expectation block.
  const legendaTagPre = extrairNumeroTag(lote.legenda);
  let unidadePre = (lote.unidade_contexto ?? "").trim() || null;
  if (!unidadePre) unidadePre = await getUnidadeInspetor(lote.phone);
  let esperado: { esguicho?: string | null; mangueira?: string | null; chave_storz?: string | null } | undefined;
  try {
    const c = await buscarConstantesHidrante(unidadePre, legendaTagPre ?? lote.legenda);
    if (c) esperado = { esguicho: c.esguicho, mangueira: c.mangueira, chave_storz: c.chave_storz };
  } catch (err: any) {
    log.warn({ err: err.message }, "não foi possível buscar constantes do hidrante (seguindo sem expectativa)");
  }

  let rawResposta: string;
  try {
    const completion = await (await getOpenAI()).chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 1500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_HIDRANTE },
        { role: "user",   content: buildUserMessageHidrante(lote.legenda, lote.fotos, esperado) },
      ],
    });
    rawResposta = completion.choices[0]?.message?.content ?? "";
    void registrarUsoOpenAI({
      loteId: lote.id, modelo: "gpt-4o",
      prompt_tokens: completion.usage?.prompt_tokens,
      completion_tokens: completion.usage?.completion_tokens,
      total_tokens: completion.usage?.total_tokens,
    });
  } catch (err: any) {
    log.error({ err: err.message }, "erro na chamada à API OpenAI (hidrante)");
    if (ehFalhaCriticaOpenAI(err)) void alertarFalhaOpenAI(err);
    await supabase.from("lotes_fotos").update({ status: "erro_ia" }).eq("id", lote.id);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(limparFences(rawResposta));
  } catch {
    log.error({ rawResposta }, "resposta inválida da IA — JSON malformado");
    await supabase.from("lotes_fotos").update({ status: "erro_ia" }).eq("id", lote.id);
    return null;
  }

  const validacao = RespostaHidranteSchema.safeParse(parsed);
  if (!validacao.success) {
    log.error({ erros: validacao.error.flatten() }, "resposta inválida da IA — falha na validação");
    await supabase.from("lotes_fotos").update({ status: "erro_ia" }).eq("id", lote.id);
    return null;
  }

  let resultado = validacao.data;

  // The number the inspector typed (caption) is authoritative — overrides the AI.
  // Reuse the values resolved before the AI call (legendaTagPre / unidadePre).
  const legendaTag = legendaTagPre;
  if (legendaTag && legendaTag !== resultado.numero_hidrante) {
    resultado = { ...resultado, numero_hidrante: legendaTag };
  }

  try {
    const r = await salvarHidrantePorUnidade({
      resultado,
      loteId: lote.id,
      fotos: lote.fotos,
      unidadeContexto: unidadePre,
      numeroLegenda: legendaTag,
    });

    if (r.tipo === "aplicado") {
      log.info({ unidade: r.unidade, numero: r.numero }, "inspeção de hidrante aplicada ao slot");
    } else {
      log.warn({ motivo: r.motivo }, "inspeção de hidrante parqueada (pendente)");
    }

    // Confirmation to the inspector.
    try {
      const resumo = r.tipo === "aplicado"
        ? `✅ Hidrante ${resultado.numero_hidrante} registrado (${r.unidade}). Aguardando verificação no painel.`
        : `⚠️ Não consegui vincular o hidrante ${resultado.numero_hidrante}: ${r.motivo}. Guardei para revisão (nada foi perdido).`;
      await sendWhatsAppMessage(lote.phone, resumo);
    } catch { /* best-effort */ }

    await supabase
      .from("lotes_fotos")
      .update({ status: r.tipo === "aplicado" ? "processado" : "pendente_atribuicao" })
      .eq("id", lote.id);
  } catch (err: any) {
    log.error({ err: err.message }, "falha ao persistir resultado de hidrante");
    await supabase.from("lotes_fotos").update({ status: "erro_persistencia" }).eq("id", lote.id);
  }

  return resultado;
}
