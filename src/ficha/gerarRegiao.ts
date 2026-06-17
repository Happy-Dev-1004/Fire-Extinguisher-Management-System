// Generates a region report in the OFFICIAL ficha format (same layout as the
// sample PDF: checklist per extinguisher, photos, logos, participantes footer).
//
// In the regional model the inspection data lives directly on each extintores
// slot (status_inspecao + the checklist columns), not in a separate inspecoes
// row. So we read those columns off every slot in the region. Uninspected slots
// render as blank checklist blocks — the report shows the WHOLE region.

import { supabase } from "../db";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { renderHtml, type ExtintorFicha, type ItemInspecao, type DadosFicha } from "./template";
import { renderPdfFromHtml } from "../pdf/browser";

export type GerarFichaRegiaoResult =
  | { ok: true;  pdfBuffer: Buffer }
  | { ok: false; motivo: string };

function montarItens(e: Record<string, any>): ItemInspecao[] {
  const obs = e.observacoes ?? "";
  return [
    { nome: "Lacre",               status: e.lacre ?? "",              observacao: "" },
    { nome: "Vencimento Carga",    status: statusVenc(e.vencimento_carga), observacao: e.vencimento_carga ?? "" },
    { nome: "Vencimento Teste",    status: statusVenc(e.vencimento_teste), observacao: e.vencimento_teste ?? "" },
    { nome: "Manômetro",           status: e.manometro ?? "",          observacao: "" },
    { nome: "Sinalização Parede",  status: e.sinalizacao_parede ?? "", observacao: "" },
    { nome: "Sinalização Piso",    status: e.sinalizacao_piso ?? "",   observacao: obs },
    { nome: "Suporte",             status: e.suporte ?? "",            observacao: "" },
    { nome: "Mangueira",           status: e.mangueira ?? "",          observacao: "" },
    { nome: "Quadro de Instrução", status: e.quadro_instrucao ?? "",   observacao: "" },
  ];
}

// The checklist "status" column expects OK/Reprovado/N.A/Indeterminado/"".
// vencimento_* are date strings — show them as the observação and mark the
// status cell based on whether a date is present.
function statusVenc(v: string | null | undefined): ItemInspecao["status"] {
  return v && v.trim() ? "OK" : "";
}

function montarItensVazios(): ItemInspecao[] {
  return [
    "Lacre", "Vencimento Carga", "Vencimento Teste", "Manômetro",
    "Sinalização Parede", "Sinalização Piso", "Suporte", "Mangueira",
    "Quadro de Instrução",
  ].map((nome) => ({ nome, status: "" as const, observacao: "" }));
}

// semFotos=true produces a LIGHT report: same layout, checklist and sectors, but
// WITHOUT embedding the (full-size, remote) photos. The full report embeds every
// photo, which for a 300-extinguisher region means Playwright downloading 100s of
// multi-MB images → 25-30s and a 15-20 MB PDF, which times out a browser preview.
// The preview uses semFotos for speed; download/send still embed the photos.
export async function gerarFichaRegiao(
  regiao: string,
  opts: { semFotos?: boolean } = {}
): Promise<GerarFichaRegiaoResult> {
  const log = logger.child({ regiao, tipo: "ficha-regiao", semFotos: !!opts.semFotos });

  const { data: extintoresDb, error } = await supabase
    .from("extintores")
    .select("*")
    .eq("regiao", regiao)
    .order("numero_int", { ascending: true, nullsFirst: false })
    .order("numero");

  if (error) return { ok: false, motivo: `Erro ao buscar dados: ${error.message}` };
  if (!extintoresDb || extintoresDb.length === 0) {
    return { ok: false, motivo: `Nenhum extintor cadastrado para ${regiao}.` };
  }

  const extintores: ExtintorFicha[] = (extintoresDb as any[]).map((e) => {
    const inspecionado = e.status_inspecao && e.status_inspecao !== "nao_inspecionado";
    return {
      numero:          e.numero,
      setor:           e.setor || regiao,
      tipo_carga:      e.tipo_carga ?? "",
      itens:           inspecionado ? montarItens(e) : montarItensVazios(),
      fotos:           opts.semFotos ? [] : (Array.isArray(e.fotos) ? e.fotos : []),
      naoInspecionado: !inspecionado,
    };
  });

  // Active cycle month for the header.
  const { data: ciclo } = await supabase
    .from("ciclos").select("mes_referencia").eq("status", "ativo").maybeSingle();

  const dados: DadosFicha = {
    unidade:       regiao,
    mesReferencia: (ciclo as any)?.mes_referencia ?? "",
    dataInspecao:  "",
    extintores,
  };

  // Active inspectors → PARTICIPANTES footer.
  const { data: inspetoresAtivos } = await supabaseAdmin
    .from("inspetores").select("nome").eq("ativo", true).order("nome");
  if (inspetoresAtivos && inspetoresAtivos.length > 0) {
    dados.participantes = (inspetoresAtivos as { nome: string }[]).map((i) => i.nome.toUpperCase());
  }

  log.info({ total: extintores.length }, "ficha de região gerada");
  const pdfBuffer = await renderPdfFromHtml(renderHtml(dados));
  return { ok: true, pdfBuffer };
}
