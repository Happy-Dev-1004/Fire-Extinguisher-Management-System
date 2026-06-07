import type { RespostaIA } from "../analise/schema";

// Human-readable label for each checklist item, in Brazilian Portuguese.
// Matches the 9 database columns in salvar.ts.
const LABEL_ITEM: Record<string, string> = {
  lacre:                  "Lacre",
  vencimento_carga_status: "Vencimento da carga",
  vencimento_teste_status: "Vencimento do teste hidrostático",
  manometro:              "Manômetro",
  sinalizacao_parede:     "Sinalização de parede",
  sinalizacao_piso:       "Sinalização de piso",
  suporte:                "Suporte",
  mangueira:              "Mangueira",
  quadro_instrucao:       "Quadro de instrução",
};

const CHECKLIST_CAMPOS = Object.keys(LABEL_ITEM) as Array<keyof typeof LABEL_ITEM>;

// Returns the list of item labels whose status is "Reprovado".
function itensReprovados(resultado: RespostaIA): string[] {
  return CHECKLIST_CAMPOS.filter(
    (campo) => (resultado as any)[campo] === "Reprovado"
  ).map((campo) => LABEL_ITEM[campo]);
}

/**
 * Builds the WhatsApp confirmation text for a processed inspection.
 * Pure function — no side effects, no I/O.
 * Plain text only: no markdown, no asterisks (WhatsApp renders them as bold,
 * which looks odd to field workers and may vary by device).
 */
export function montarMensagemConfirmacao(
  resultado: RespostaIA,
  unidade: string
): string {
  const numero   = resultado.numero_extintor;
  const vencCarga = resultado.vencimento_carga || "não identificado";
  const reprovados = itensReprovados(resultado);

  if (reprovados.length === 0) {
    return (
      `✅ Extintor ${numero} (${unidade}) registrado com sucesso.\n` +
      `Carga vence em: ${vencCarga}.\n` +
      `Tudo conforme na inspeção.`
    );
  }

  const lista = reprovados.map((item) => `• ${item}`).join("\n");
  return (
    `⚠️ Extintor ${numero} (${unidade}) registrado, mas com ressalva.\n` +
    `Itens com problema:\n${lista}\n` +
    `Verifique e tome as devidas providências.`
  );
}
