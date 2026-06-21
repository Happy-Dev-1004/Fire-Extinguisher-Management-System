import OpenAI from "openai";
import { supabase } from "../db";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { RespostaIASchema, type RespostaIA } from "./schema";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";
import { salvarPorRegiao } from "../persistencia/salvarPorRegiao";
import { notificarInspetorPorLote } from "../notificacao/notificar";
import { variantesTelefone } from "../inspetores/normalizar";
import { getSecret } from "../segredos/getSecret";
import { registrarUsoOpenAI, ehFalhaCriticaOpenAI, alertarFalhaOpenAI } from "../notificacao/saude";

const MIN_FOTOS = 1;

// Looks up the registered unit for the inspector who sent this batch.
// Returns null on any failure — callers treat that as "no unit found".
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
  const apiKey = await getSecret("OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

export interface LoteFotos {
  id: string;
  phone: string;
  legenda: string;
  fotos: string[];
  status: string;
  unidade_contexto?: string;
  mes_referencia?: string;
  data_inspecao?: string;
}

function limparFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}


// Extracts an extinguisher tag from a photo caption typed by the inspector.
// Accepts pure numbers ("57", "01") and common tag formats ("A-12", "R 3", "12B").
// Returns null for the auto-placeholder ("Extintor") or free-text captions, so
// those never override what the AI read.
export function extrairNumeroTag(legenda: string | null | undefined): string | null {
  if (!legenda) return null;
  const t = legenda.trim();
  if (!t) return null;

  // Reject the auto-generated placeholder used for caption-less first photos.
  if (/^extintor$/i.test(t)) return null;

  // Pure number — kept EXACTLY as typed, including leading zeros, because the
  // client's tags and report use that form ("Nº 01", "Nº 100").
  if (/^\d{1,4}$/.test(t)) return t;

  // Letter-number tag: "A-12", "R 3", "12B", "AB-07" — real asset identifiers.
  // Collapse spaces and uppercase for consistency.
  if (/^[A-Za-z]{0,3}[\s\-]?\d{1,4}[A-Za-z]?$/.test(t)) {
    return t.replace(/\s+/g, "").toUpperCase();
  }

  return null;
}

function aplicarRegrasNegocio(data: RespostaIA): RespostaIA {
  const tipoCO2 = data.tipo_carga.toUpperCase().includes("CO2");
  return {
    ...data,
    manometro: tipoCO2 ? "N.A" : data.manometro,
  };
}

export async function analisarLote(lote: LoteFotos): Promise<RespostaIA | null> {
  const log = logger.child({ loteId: lote.id, extintor: lote.legenda, phone: lote.phone });

  if (!["pronto"].includes(lote.status)) {
    log.info({ status: lote.status }, "lote ignorado — status não é 'pronto'");
    return null;
  }

  if (lote.fotos.length < MIN_FOTOS) {
    log.warn({ qtdFotos: lote.fotos.length }, "lote incompleto — fotos insuficientes");
    await supabase.from("lotes_fotos").update({ status: "lote_incompleto" }).eq("id", lote.id);
    return null;
  }

  // Optimistic lock — prevent double analysis if restarted mid-flight
  const { error: lockError } = await supabase
    .from("lotes_fotos")
    .update({ status: "em_analise" })
    .eq("id", lote.id)
    .eq("status", "pronto");

  if (lockError) {
    log.error({ err: lockError.message }, "falha ao bloquear lote para análise");
    return null;
  }

  log.info({ qtdFotos: lote.fotos.length }, "enviando para IA");

  let rawResposta: string;
  try {
    const completion = await (await getOpenAI()).chat.completions.create({
      model: "gpt-4o",
      // temperature 0 = deterministic extraction: the model reports what it
      // reads instead of "creatively" guessing dates. Higher token budget
      // gives it room to examine the label carefully before answering.
      temperature: 0,
      max_tokens: 1500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: buildUserMessage(lote.legenda, lote.fotos) },
      ],
    });
    rawResposta = completion.choices[0]?.message?.content ?? "";
    // Track token consumption (OpenAI has no balance API — we tally it ourselves).
    void registrarUsoOpenAI({
      loteId: lote.id,
      modelo: "gpt-4o",
      prompt_tokens: completion.usage?.prompt_tokens,
      completion_tokens: completion.usage?.completion_tokens,
      total_tokens: completion.usage?.total_tokens,
    });
  } catch (err: any) {
    log.error({ err: err.message }, "erro na chamada à API OpenAI");
    // If this is "out of quota / key dead", raise a critical owner alert now.
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

  const validacao = RespostaIASchema.safeParse(parsed);
  if (!validacao.success) {
    log.error({ erros: validacao.error.flatten(), rawResposta }, "resposta inválida da IA — falha na validação");
    await supabase.from("lotes_fotos").update({ status: "erro_ia" }).eq("id", lote.id);
    return null;
  }

  let resultado = aplicarRegrasNegocio(validacao.data);

  // The number the inspector typed as the photo caption is authoritative — they
  // explicitly identified the extinguisher, which is more reliable than the AI
  // reading a possibly-blurry tag. Only override when the caption looks like a
  // real tag (a number, optionally with a letter prefix like "A-12"), not when
  // it's an auto-generated placeholder ("Extintor").
  const legendaTag = extrairNumeroTag(lote.legenda);
  if (legendaTag && legendaTag !== resultado.numero_extintor) {
    log.info(
      { aiLeu: resultado.numero_extintor, legenda: legendaTag },
      "número do extintor sobrescrito pela legenda do inspetor"
    );
    resultado = { ...resultado, numero_extintor: legendaTag };
  }

  log.info(
    {
      extintor: resultado.numero_extintor,
      unidade: resultado.unidade,
      status_geral: resultado.status_geral,
      confianca: resultado.confianca,
      tem_irregularidade: ["lacre","vencimento_carga_status","vencimento_teste_status","manometro",
        "sinalizacao_parede","sinalizacao_piso","suporte","mangueira","quadro_instrucao"]
        .some((k) => (resultado as any)[k] === "Reprovado"),
    },
    "IA respondeu"
  );

  // Region resolution order:
  //   1. region context captured on the batch when it opened
  //   2. the inspector's CURRENT registered region (looked up by phone)
  // The region is what the inspector announced before sending photos.
  let regiaoContexto = (lote.unidade_contexto ?? "").trim() || null;
  if (!regiaoContexto) {
    regiaoContexto = (await getUnidadeInspetor(lote.phone)) ?? null;
    if (regiaoContexto) log.info({ regiao: regiaoContexto }, "região resolvida a partir do cadastro do inspetor");
  }

  // The number the inspector typed as the caption identifies WHICH extinguisher
  // slot to fill (region + number). Fall back to the AI-read number.
  const numeroLegenda = extrairNumeroTag(lote.legenda);

  try {
    const r = await salvarPorRegiao({
      resultado,
      loteId: lote.id,
      fotos: lote.fotos,
      regiaoContexto,
      numeroLegenda,
    });

    if (r.tipo === "aplicado") {
      log.info({ regiao: r.regiao, numero: r.numero, slotId: r.slotId }, "inspeção aplicada ao slot");
    } else {
      log.warn({ motivo: r.motivo }, "inspeção parqueada para atribuição manual (pendente)");
    }

    await notificarInspetorPorLote({
      loteId: lote.id,
      phone: lote.phone,
      resultado,
      unidade: regiaoContexto ?? "",
    });

    await supabase
      .from("lotes_fotos")
      .update({ status: r.tipo === "aplicado" ? "processado" : "pendente_atribuicao" })
      .eq("id", lote.id);

    log.info({ loteId: lote.id, tipo: r.tipo }, "lote finalizado");
  } catch (err: any) {
    log.error({ err: err.message }, "falha ao persistir resultado — lote marcado como erro_persistencia");
    await supabase
      .from("lotes_fotos")
      .update({ status: "erro_persistencia" })
      .eq("id", lote.id);
  }

  return resultado;
}
