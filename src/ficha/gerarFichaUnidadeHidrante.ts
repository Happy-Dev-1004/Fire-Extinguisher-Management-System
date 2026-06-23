// Generates a hydrant unit report in the official ficha format.
// Mirrors gerarFichaRegiao (extinguishers): reads the hydrant slots of a unit,
// builds the 10-item checklist per hydrant, downscales photos, renders the PDF.

import { supabaseAdmin as supabase } from "../db-admin";
import { logger } from "../logger";
import { renderHtmlHidrante, type HidranteFicha, type ItemHidranteFicha, type StatusHidranteCell, type DadosFichaHidrante } from "./templateHidrante";
import { renderPdfFromHtml } from "../pdf/browser";
import { thumbnailsDeUrls } from "./thumbnails";
import { ITENS_HIDRANTE } from "../analise/schemaHidrante";

export type GerarFichaHidranteResult =
  | { ok: true;  pdfBuffer: Buffer }
  | { ok: false; motivo: string };

function valido(v: any): StatusHidranteCell {
  return ["OK", "RUIM", "PENDENTE", "ENCAMINHAR", "N.A", "Indeterminado"].includes(v) ? v : "";
}

function montarItens(h: Record<string, any>): ItemHidranteFicha[] {
  return ITENS_HIDRANTE.map(({ chave, rotulo }) => ({
    nome: rotulo,
    status: valido(h[chave]),
    // The whole-hydrant observação shows once (on the last item) to mirror the form.
    observacao: chave === "c_tampa_hidrante" ? (h.observacoes ?? "") : "",
  }));
}

function montarItensVazios(): ItemHidranteFicha[] {
  return ITENS_HIDRANTE.map(({ rotulo }) => ({ nome: rotulo, status: "" as const, observacao: "" }));
}

export async function gerarFichaUnidadeHidrante(
  unidade: string,
  opts: { semFotos?: boolean } = {}
): Promise<GerarFichaHidranteResult> {
  const log = logger.child({ unidade, tipo: "ficha-hidrante", semFotos: !!opts.semFotos });

  const { data: hidrantesDb, error } = await supabase
    .from("hidrantes")
    .select("*")
    .eq("unidade", unidade)
    .order("numero_int", { ascending: true });

  if (error) return { ok: false, motivo: `Erro ao buscar dados: ${error.message}` };
  if (!hidrantesDb || hidrantesDb.length === 0) {
    return { ok: false, motivo: `Nenhum hidrante cadastrado para ${unidade}.` };
  }

  const hidrantes: HidranteFicha[] = (hidrantesDb as any[]).map((h) => {
    const inspecionado = h.status_inspecao && h.status_inspecao !== "nao_inspecionado";
    return {
      numero:          h.numero,
      setor:           h.setor || unidade,
      itens:           inspecionado ? montarItens(h) : montarItensVazios(),
      fotos:           opts.semFotos ? [] : (Array.isArray(h.fotos) ? h.fotos : []),
      naoInspecionado: !inspecionado,
    };
  });

  if (!opts.semFotos) {
    const todasUrls = hidrantes.flatMap((x) => x.fotos);
    const thumbs = await thumbnailsDeUrls(todasUrls);
    for (const x of hidrantes) {
      x.fotos = x.fotos.map((u) => thumbs.get(u)).filter((v): v is string => !!v);
    }
    log.info({ urls: todasUrls.length, thumbs: thumbs.size }, "fotos redimensionadas para o relatório");
  }

  const { data: ciclo } = await supabase
    .from("ciclos_hidrante").select("mes_referencia").eq("status", "ativo").maybeSingle();

  const dados: DadosFichaHidrante = {
    unidade,
    mesReferencia: (ciclo as any)?.mes_referencia ?? "",
    dataInspecao: "",
    hidrantes,
  };

  const { data: inspetoresAtivos } = await supabase
    .from("inspetores").select("nome").eq("ativo", true).order("nome");
  if (inspetoresAtivos && inspetoresAtivos.length > 0) {
    dados.participantes = (inspetoresAtivos as { nome: string }[]).map((i) => i.nome.toUpperCase());
  }

  log.info({ total: hidrantes.length }, "ficha de hidrantes gerada");
  const pdfBuffer = await renderPdfFromHtml(renderHtmlHidrante(dados));
  return { ok: true, pdfBuffer };
}
