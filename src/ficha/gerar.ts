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

// Builds the 9 checklist rows from an inspection. The OBSERVAÇÕES text (when the
// AI captured one) is attached to the "Sinalização Piso" row — that is where the
// real sheet records notes like "Sugestão de melhoria" / "Falta pintura".
function montarItens(inspecao: Record<string, any>): ItemInspecao[] {
  const obs = inspecao.observacoes ?? "";
  return [
    { nome: "Lacre",               status: inspecao.lacre,              observacao: "" },
    { nome: "Vencimento Carga",    status: inspecao.vencimento_carga,   observacao: "" },
    { nome: "Vencimento Teste",    status: inspecao.vencimento_teste,   observacao: "" },
    { nome: "Manômetro",           status: inspecao.manometro,          observacao: "" },
    { nome: "Sinalização Parede",  status: inspecao.sinalizacao_parede, observacao: "" },
    { nome: "Sinalização Piso",    status: inspecao.sinalizacao_piso,   observacao: obs },
    { nome: "Suporte",             status: inspecao.suporte,            observacao: "" },
    { nome: "Mangueira",           status: inspecao.mangueira,          observacao: "" },
    { nome: "Quadro de Instrução", status: inspecao.quadro_instrucao,   observacao: "" },
  ];
}

// Blank 9-row checklist for an extinguisher with no inspection in the month.
function montarItensVazios(): ItemInspecao[] {
  return [
    "Lacre", "Vencimento Carga", "Vencimento Teste", "Manômetro",
    "Sinalização Parede", "Sinalização Piso", "Suporte", "Mangueira",
    "Quadro de Instrução",
  ].map((nome) => ({ nome, status: "" as const, observacao: "" }));
}

// Extinguisher numbers are stored as strings ("1", "01", "100", "Reserva").
// Sort numerically when possible so the sheet runs 1 → last; non-numeric tags
// (rare) fall to the end, ordered alphabetically.
function compararNumero(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b, "pt-BR");
}

export async function generateFicha(input: GerarFichaInput): Promise<GerarFichaResult> {
  const log = logger.child({ unidade: input.unidade, mes: input.mesReferencia });

  // ── 1. Fetch the FULL registry for the unit (1 → last, incl. reserva) ─────
  const { data: extintoresDb, error: errExt } = await supabase
    .from("extintores")
    .select("numero, unidade, setor, tipo_carga, capacidade")
    .eq("unidade", input.unidade);

  if (errExt) {
    log.error({ err: errExt.message }, "falha ao buscar extintores da unidade");
    return { ok: false, motivo: `Erro ao buscar dados: ${errExt.message}` };
  }

  if (!extintoresDb || extintoresDb.length === 0) {
    log.warn("nenhum extintor cadastrado para esta unidade");
    return { ok: false, motivo: `Nenhum extintor cadastrado para ${input.unidade}.` };
  }

  // ── 2. Fetch this month's inspections for the unit, keyed by extinguisher ─
  const { data: inspecoes, error: errInsp } = await supabase
    .from("inspecoes")
    .select("*")
    .eq("extintor_unidade", input.unidade)
    .eq("mes_referencia", input.mesReferencia)
    .order("data_inspecao", { ascending: false });

  if (errInsp) {
    log.error({ err: errInsp.message }, "falha ao buscar inspeções para a ficha");
    return { ok: false, motivo: `Erro ao buscar inspeções: ${errInsp.message}` };
  }

  // Latest inspection per extinguisher number (most recent wins within the month)
  const inspPorNumero = new Map<string, any>();
  for (const ins of (inspecoes ?? [])) {
    if (!inspPorNumero.has(ins.extintor_numero)) inspPorNumero.set(ins.extintor_numero, ins);
  }

  log.info(
    { totalExtintores: extintoresDb.length, totalInspecoes: inspPorNumero.size },
    "dados carregados para a ficha"
  );

  // ── 3. Map every registered extinguisher → template block ───────────────
  //      Inspected → filled checklist + photos; uninspected → blank block.
  const ordenados = [...extintoresDb].sort((a: any, b: any) =>
    compararNumero(a.numero, b.numero)
  );

  const extintores: ExtintorFicha[] = ordenados.map((e: any) => {
    const ins = inspPorNumero.get(e.numero);
    if (ins) {
      return {
        numero:     e.numero,
        setor:      e.setor || input.unidade,
        tipo_carga: e.tipo_carga ?? "",
        itens:      montarItens(ins),
        fotos:      Array.isArray(ins.fotos) ? ins.fotos : [],
      };
    }
    return {
      numero:          e.numero,
      setor:           e.setor || input.unidade,
      tipo_carga:      e.tipo_carga ?? "",
      itens:           montarItensVazios(),
      fotos:           [],
      naoInspecionado: true,
    };
  });

  const dados: DadosFicha = {
    unidade:      input.unidade,
    mesReferencia: input.mesReferencia,
    dataInspecao: inspecoes?.[0]?.data_inspecao ?? "",
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

  log.info(
    { pdfPath, unidade: input.unidade, mes: input.mesReferencia, qtdExtintores: extintores.length },
    "ficha gerada"
  );
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
