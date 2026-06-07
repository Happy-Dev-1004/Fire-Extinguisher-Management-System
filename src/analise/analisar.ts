import OpenAI from "openai";
import { supabase } from "../db";
import { logger } from "../logger";
import { RespostaIASchema, type RespostaIA } from "./schema";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";

const MIN_FOTOS = 1;

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não definida no .env");
  return new OpenAI({ apiKey });
}

export interface LoteFotos {
  id: string;
  legenda: string;
  fotos: string[];
  status: string;
}

// Strip accidental ```json ... ``` fences the model sometimes adds
function limparFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

// Apply domain rules that the model must follow but might miss
function aplicarRegrasNegocio(data: RespostaIA): RespostaIA {
  const tipoCO2 = data.tipo_carga.toUpperCase().includes("CO2");
  return {
    ...data,
    manometro: tipoCO2 ? "N.A" : data.manometro,
  };
}

export async function analisarLote(lote: LoteFotos): Promise<RespostaIA | null> {
  const log = logger.child({ loteId: lote.id, extintor: lote.legenda });

  // Idempotency: skip batches already analyzed or in error state
  if (!["pronto"].includes(lote.status)) {
    log.info({ status: lote.status }, "lote ignorado — status não é 'pronto'");
    return null;
  }

  if (lote.fotos.length < MIN_FOTOS) {
    log.warn({ totalFotos: lote.fotos.length }, "lote incompleto — fotos insuficientes para análise");
    await supabase.from("lotes_fotos").update({ status: "lote_incompleto" }).eq("id", lote.id);
    return null;
  }

  // Mark as "em_analise" before calling the API to prevent double-charging
  // if the process crashes mid-flight and restarts
  const { error: lockError } = await supabase
    .from("lotes_fotos")
    .update({ status: "em_analise" })
    .eq("id", lote.id)
    .eq("status", "pronto"); // only update if still 'pronto' (optimistic lock)

  if (lockError) {
    log.error({ err: lockError.message }, "falha ao bloquear lote para análise");
    return null;
  }

  log.info({ totalFotos: lote.fotos.length }, "iniciando análise com gpt-4o Vision");

  let rawResposta: string;
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserMessage(lote.legenda, lote.fotos),
        },
      ],
    });
    rawResposta = completion.choices[0]?.message?.content ?? "";
  } catch (err: any) {
    log.error({ err: err.message }, "erro na chamada à API OpenAI");
    await supabase.from("lotes_fotos").update({ status: "erro_ia" }).eq("id", lote.id);
    return null;
  }

  // Parse and validate
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
    log.error(
      { erros: validacao.error.flatten(), rawResposta },
      "resposta inválida da IA — falha na validação do schema"
    );
    await supabase.from("lotes_fotos").update({ status: "erro_ia" }).eq("id", lote.id);
    return null;
  }

  const resultado = aplicarRegrasNegocio(validacao.data);

  log.info({ confianca: resultado.confianca, status_geral: resultado.status_geral }, "análise concluída");

  // Mark batch as analyzed
  await supabase
    .from("lotes_fotos")
    .update({ status: "analisado" })
    .eq("id", lote.id);

  return resultado;
}
