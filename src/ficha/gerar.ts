import path from "path";
import fs from "fs";
import { supabase } from "../db";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { renderHtml, type ExtintorFicha, type ItemInspecao, type DadosFicha } from "./template";
export { buildSampleData } from "./sample";

export interface GerarFichaInput {
  unidade: string;
  mesReferencia: string; // e.g. "Maio/2026"
}

export type GerarFichaResult =
  | { ok: true;  pdfPath: string; pdfBuffer: Buffer }
  | { ok: false; motivo: string };

const NOMES_ITENS: Record<string, string> = {
  lacre:                  "Lacre",
  vencimento_carga:       "Vencimento Carga",
  vencimento_teste:       "Vencimento Teste",
  manometro:              "Manômetro",
  sinalizacao_parede:     "Sinalização Parede",
  sinalizacao_piso:       "Sinalização Piso",
  suporte:                "Suporte",
  mangueira:              "Mangueira",
  quadro_instrucao:       "Quadro de Instrução",
};

// The client's rule: the OBSERVAÇÕES column carries the vencimento da carga value
// for the relevant rows; N.A where applicable.
function montarItens(inspecao: Record<string, any>): ItemInspecao[] {
  return [
    { nome: "Lacre",               status: inspecao.lacre,              observacao: "" },
    { nome: "Vencimento Carga",    status: inspecao.vencimento_carga,   observacao: inspecao.observacoes ?? "" },
    { nome: "Vencimento Teste",    status: inspecao.vencimento_teste,   observacao: "" },
    { nome: "Manômetro",           status: inspecao.manometro,          observacao: "" },
    { nome: "Sinalização Parede",  status: inspecao.sinalizacao_parede, observacao: "" },
    { nome: "Sinalização Piso",    status: inspecao.sinalizacao_piso,   observacao: "" },
    { nome: "Suporte",             status: inspecao.suporte,            observacao: "" },
    { nome: "Mangueira",           status: inspecao.mangueira,          observacao: "" },
    { nome: "Quadro de Instrução", status: inspecao.quadro_instrucao,   observacao: "" },
  ];
}

export async function generateFicha(input: GerarFichaInput): Promise<GerarFichaResult> {
  const log = logger.child({ unidade: input.unidade, mes: input.mesReferencia });

  // ── 1. Query inspections joined with registry ────────────────────────────
  const { data: inspecoes, error } = await supabase
    .from("inspecoes")
    .select(`
      *,
      extintor:extintores!inner(numero, unidade, setor, tipo_carga, capacidade, vencimento_carga, vencimento_teste)
    `)
    .eq("extintor_unidade", input.unidade)
    .eq("mes_referencia", input.mesReferencia)
    .order("extintor_numero", { ascending: true });

  if (error) {
    log.error({ err: error.message }, "falha ao buscar inspeções para a ficha");
    return { ok: false, motivo: `Erro ao buscar dados: ${error.message}` };
  }

  if (!inspecoes || inspecoes.length === 0) {
    log.warn("nenhuma inspeção encontrada para esta unidade/mês");
    return { ok: false, motivo: `Sem inspeções para ${input.unidade} em ${input.mesReferencia}.` };
  }

  log.info({ total: inspecoes.length }, "inspeções carregadas para a ficha");

  // ── 2. Map DB rows → template data ──────────────────────────────────────
  const extintores: ExtintorFicha[] = inspecoes.map((ins: any) => ({
    numero:     ins.extintor_numero,
    setor:      ins.extintor?.setor ?? ins.extintor_unidade,
    tipo_carga: ins.extintor?.tipo_carga ?? "",
    itens:      montarItens(ins),
    fotos:      Array.isArray(ins.fotos) ? ins.fotos : [],
  }));

  const dados: DadosFicha = {
    unidade:      input.unidade,
    mesReferencia: input.mesReferencia,
    dataInspecao: inspecoes[0]?.data_inspecao ?? "",
    extintores,
  };

  // ── 3. Fetch active inspectors for the PARTICIPANTES footer ─────────────
  const { data: inspetoresAtivos } = await supabaseAdmin
    .from("inspetores")
    .select("nome")
    .eq("ativo", true)
    .order("nome");

  if (inspetoresAtivos && inspetoresAtivos.length > 0) {
    dados.participantes = (inspetoresAtivos as { nome: string }[]).map((i) =>
      i.nome.toUpperCase()
    );
  }

  // ── 4. Render HTML ───────────────────────────────────────────────────────
  const html = renderHtml(dados);

  // ── 5. Convert to PDF via Playwright ────────────────────────────────────
  const pdfBuffer = await renderPdf(html, log);

  // ── 6. Save to disk ──────────────────────────────────────────────────────
  const outputDir = path.join(process.cwd(), "fichas");
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = `ficha_${input.unidade.replace(/\s+/g, "_")}_${input.mesReferencia.replace("/", "-")}.pdf`;
  const pdfPath = path.join(outputDir, fileName);
  fs.writeFileSync(pdfPath, pdfBuffer);

  log.info({ pdfPath }, "ficha gerada com sucesso");
  return { ok: true, pdfPath, pdfBuffer };
}

async function renderPdf(html: string, log: any): Promise<Buffer> {
  const { chromium } = await import("playwright");
  // channel:"chrome" uses the full Chromium build (not headless-shell)
  // which is the binary confirmed present after install
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
