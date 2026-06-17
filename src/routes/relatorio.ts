// Auth enforced at mount point in index.ts: requireAuth + requireAdmin
//
// POST /relatorio/ficha          — official inspection sheet (PDF) for a unit+month
// POST /relatorio/generico       — generic search-driven export (PDF or CSV)
// POST /relatorio/extintor/:id   — single extinguisher full history PDF

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabase } from "../db";
import { logger } from "../logger";
import { generateFicha } from "../ficha/gerar";
import { renderHtml, type DadosFicha, type ExtintorFicha, type ItemInspecao } from "../ficha/template";
import { supabaseAdmin } from "../db-admin";
import { executarBusca, type ResultadoBusca } from "../busca/filtros";
import { renderPdfFromHtml as renderPdf } from "../pdf/browser";
import { gerarFichaRegiao } from "../ficha/gerarRegiao";

const router = Router();
const log    = logger.child({ rota: "/relatorio" });

// ── POST /relatorio/ficha ─────────────────────────────────────────────────────

const FichaBodySchema = z.object({
  unidade:       z.string().min(1),
  mes_referencia: z.string().min(1),
});

router.post("/ficha", async (req: Request, res: Response) => {
  const parse = FichaBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parse.error.flatten().fieldErrors });
  }

  const { unidade, mes_referencia } = parse.data;
  const rlog = log.child({ unidade, mes_referencia, tipo: "ficha" });
  rlog.info("gerando ficha oficial");

  const resultado = await generateFicha({ unidade, mesReferencia: mes_referencia });
  if (!resultado.ok) {
    rlog.warn({ motivo: resultado.motivo }, "ficha não gerada");
    return res.status(404).json({ erro: resultado.motivo });
  }

  rlog.info("ficha gerada — enviando PDF");
  const fileName = `ficha_${unidade.replace(/\s+/g, "_")}_${mes_referencia.replace("/", "-")}.pdf`;
  res
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${fileName}"`)
    .send(resultado.pdfBuffer);
});

// ── POST /relatorio/generico ──────────────────────────────────────────────────

// This endpoint receives a JSON body (not query params), so the frontend sends
// NATIVE types: tem_irregularidade as a real boolean, vence_em_dias as a number.
// FiltrosSchema was built for query strings (string→bool/number coercion), so we
// define a body-specific schema here. Empty strings are normalized to undefined
// so an untouched filter field never trips validation.
// Treats "" / null as "field not provided". The inner schema is made optional
// FIRST so that the undefined produced by preprocess is accepted.
const emptyToUndef = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());

const GenericoBodySchema = z.object({
  regiao:             emptyToUndef(z.string()),
  unidade:            emptyToUndef(z.string()),
  setor:              emptyToUndef(z.string()),
  numero:             emptyToUndef(z.string()),
  tipo_carga:         emptyToUndef(z.string()),
  situacao:           emptyToUndef(z.enum(["em_dia","proximo","vencido","descartado","indeterminado"])),
  status_geral:       emptyToUndef(z.string()),
  tem_irregularidade: z.boolean().optional(),
  mes_referencia:     emptyToUndef(z.string()),
  inspetor:           emptyToUndef(z.string()),
  vence_em_dias:      emptyToUndef(z.coerce.number().int().min(1).max(3650)),
  formato:            z.enum(["pdf", "csv"]).default("pdf"),
});

router.post("/generico", async (req: Request, res: Response) => {
  const parse = GenericoBodySchema.safeParse(req.body);
  if (!parse.success) {
    log.warn({ detalhes: parse.error.flatten().fieldErrors, body: req.body }, "relatório genérico — body inválido");
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parse.error.flatten().fieldErrors });
  }

  const { formato, ...filtros } = parse.data;
  const rlog = log.child({ formato, filtros, tipo: "generico" });
  rlog.info("gerando relatório genérico");

  // Fetch all pages (no pagination for export)
  const allRows: ResultadoBusca[] = [];
  let page = 1;
  while (true) {
    const pagina = await executarBusca({ ...filtros, page });
    allRows.push(...pagina.resultados);
    if (page >= pagina.total_paginas) break;
    page++;
  }

  rlog.info({ total: allRows.length }, "dados coletados");

  const ts = new Date().toISOString().slice(0, 10);

  if (formato === "csv") {
    const csv = buildCsv(allRows);
    res
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="extintores_${ts}.csv"`)
      .send(csv);
    return;
  }

  const html = buildGenericoPdfHtml(allRows, filtros, ts);
  const pdf  = await renderPdf(html);
  rlog.info("PDF genérico gerado");
  res
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="extintores_${ts}.pdf"`)
    .send(pdf);
});

// ── POST /relatorio/extintor/:id ──────────────────────────────────────────────

router.post("/extintor/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const rlog = log.child({ id, tipo: "extintor" });
  rlog.info("gerando relatório de extintor");

  const { data: extintor, error: errExt } = await supabase
    .from("extintores")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (errExt || !extintor) {
    return res.status(404).json({ erro: "Extintor não encontrado." });
  }

  const { data: inspecoes, error: errInsp } = await supabase
    .from("inspecoes")
    .select("*")
    .eq("extintor_numero", extintor.numero)
    .eq("extintor_unidade", extintor.unidade)
    .order("data_inspecao", { ascending: false });

  if (errInsp) {
    rlog.warn({ err: errInsp.message }, "erro ao buscar inspeções");
  }

  // Active inspectors for the PARTICIPANTES footer
  const { data: inspetoresAtivos } = await supabaseAdmin
    .from("inspetores")
    .select("nome")
    .eq("ativo", true)
    .order("nome");
  const participantes = (inspetoresAtivos as { nome: string }[] | null)
    ?.map((i) => i.nome.toUpperCase());

  // Render in the SAME monthly-ficha format: one block per inspection month.
  // If never inspected, a single blank block is shown.
  const linhas = inspecoes ?? [];
  const blocos: ExtintorFicha[] = linhas.length > 0
    ? linhas.map((ins: any) => ({
        numero:     `${extintor.numero}  —  ${ins.mes_referencia}`,
        setor:      extintor.setor || extintor.unidade,
        tipo_carga: extintor.tipo_carga ?? "",
        itens:      montarItensInspecao(ins),
        fotos:      Array.isArray(ins.fotos) ? ins.fotos : [],
      }))
    : [{
        numero:          extintor.numero,
        setor:           extintor.setor || extintor.unidade,
        tipo_carga:      extintor.tipo_carga ?? "",
        itens:           montarItensVazios(),
        fotos:           [],
        naoInspecionado: true,
      }];

  const dados: DadosFicha = {
    unidade:      extintor.unidade,
    mesReferencia: `EXTINTOR Nº ${extintor.numero}`,
    dataInspecao: linhas[0]?.data_inspecao ?? "",
    extintores:   blocos,
    participantes,
  };

  const html = renderHtml(dados);
  const pdf  = await renderPdf(html);

  rlog.info({ extintor: extintor.numero, inspecoes: linhas.length }, "PDF extintor gerado");
  const fileName = `extintor_${extintor.unidade.replace(/\s+/g, "_")}_${extintor.numero}.pdf`;
  res
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${fileName}"`)
    .send(pdf);
});

// ── POST /relatorio/regiao ────────────────────────────────────────────────────
// Full report for ONE region: every extinguisher (1..N), including those NOT yet
// inspected (blank rows). Verified ones are flagged. formato: "pdf" | "csv".

const RegiaoBodySchema = z.object({
  regiao:  z.string().min(1),
  formato: z.enum(["pdf", "csv"]).default("pdf"),
  // preview=true → light/fast PDF without embedded photos (avoids the 25-30s
  // render + 15-20 MB blob that times out the browser preview).
  preview: z.boolean().optional(),
});

router.post("/regiao", async (req: Request, res: Response) => {
  const parse = RegiaoBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parse.error.flatten().fieldErrors });
  }
  const { regiao, formato, preview } = parse.data;
  const rlog = log.child({ regiao, formato, preview: !!preview, tipo: "regiao" });

  const { data: extintores, error } = await supabase
    .from("extintores")
    .select("numero, numero_int, setor, tipo_carga, capacidade, vencimento_carga, vencimento_teste, status_geral, inspetor, status_inspecao")
    .eq("regiao", regiao)
    .order("numero_int", { ascending: true });
  if (error) return res.status(500).json({ erro: error.message });

  const rows = (extintores ?? []) as any[];
  const ts = new Date().toISOString().slice(0, 10);
  rlog.info({ total: rows.length }, "relatório de região gerado");

  // CSV stays a flat table (CSV can't carry the ficha layout).
  if (formato === "csv") {
    const csv = buildRegiaoCsv(regiao, rows);
    return res
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="regiao_${regiao.replace(/\s+/g, "_")}_${ts}.csv"`)
      .send(csv);
  }

  // PDF uses the OFFICIAL ficha format (same as the sample), via gerarFichaRegiao.
  // preview → omit photos so it renders fast and small.
  const ficha = await gerarFichaRegiao(regiao, { semFotos: !!preview });
  if (!ficha.ok) {
    rlog.warn({ motivo: ficha.motivo }, "ficha de região não gerada");
    return res.status(404).json({ erro: ficha.motivo });
  }
  return res
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="regiao_${regiao.replace(/\s+/g, "_")}_${ts}.pdf"`)
    .send(ficha.pdfBuffer);
});

export default router;

const STATUS_INSPECAO_PT: Record<string, string> = {
  nao_inspecionado:       "Não inspecionado",
  aguardando_verificacao: "Aguardando verificação",
  verificado:             "Verificado",
};

function buildRegiaoCsv(regiao: string, rows: any[]): string {
  const headers = ["Região","Nº","Setor","Tipo","Capacidade","Venc. Carga","Venc. Teste","Status Geral","Inspetor","Verificação"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      regiao, r.numero, r.setor ?? "", r.tipo_carga ?? "", r.capacidade ?? "",
      r.vencimento_carga ?? "", r.vencimento_teste ?? "", r.status_geral ?? "", r.inspetor ?? "",
      STATUS_INSPECAO_PT[r.status_inspecao] ?? r.status_inspecao,
    ].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

// ── CSV builder ───────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(rows: ResultadoBusca[]): string {
  const headers = [
    "Unidade","Setor","Número","Tipo de Carga","Capacidade",
    "Situação","Venc. Carga","Venc. Teste","Ativo",
    "Data Baixa","Motivo Baixa",
    "Última Inspeção","Status Geral","Irregularidade","Inspetor",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.unidade, r.setor, r.numero, r.tipo_carga, r.capacidade ?? "",
      SITUACAO_PT[r.situacao] ?? r.situacao,
      r.vencimento_carga ?? "", r.vencimento_teste ?? "",
      r.status_ativo ? "Sim" : "Não",
      r.data_baixa ?? "", r.motivo_baixa ?? "",
      r.ultima_inspecao?.data_inspecao ?? "",
      r.ultima_inspecao?.status_geral ?? "",
      r.ultima_inspecao?.tem_irregularidade ? "Sim" : r.ultima_inspecao ? "Não" : "",
      r.ultima_inspecao?.inspetor ?? "",
    ].map(csvEscape).join(","));
  }
  return lines.join("\n");
}

// ── Generic PDF builder ───────────────────────────────────────────────────────

const SITUACAO_PT: Record<string, string> = {
  em_dia:        "Em dia",
  proximo:       "Próximo do vencimento",
  vencido:       "Vencido",
  descartado:    "Descartado",
  indeterminado: "Indeterminado",
};

const SITUACAO_COLOR: Record<string, string> = {
  em_dia:        "#16a34a",
  proximo:       "#d97706",
  vencido:       "#dc2626",
  descartado:    "#6b7280",
  indeterminado: "#6b7280",
};

function buildGenericoPdfHtml(rows: ResultadoBusca[], filtros: object, ts: string): string {
  const filtrosAtivos = Object.entries(filtros)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");

  const tableRows = rows.map(r => {
    const cor = SITUACAO_COLOR[r.situacao] ?? "#6b7280";
    const sit = SITUACAO_PT[r.situacao] ?? r.situacao;
    return `<tr>
      <td>${escHtml(r.unidade)}</td>
      <td>${escHtml(r.setor)}</td>
      <td>${escHtml(r.numero)}</td>
      <td>${escHtml(r.tipo_carga)}</td>
      <td><span style="color:${cor};font-weight:600">${escHtml(sit)}</span></td>
      <td>${escHtml(r.vencimento_carga ?? "—")}</td>
      <td>${escHtml(r.vencimento_teste ?? "—")}</td>
      <td>${escHtml(r.ultima_inspecao?.status_geral ?? "—")}</td>
      <td>${escHtml(r.ultima_inspecao?.inspetor ?? "—")}</td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; color: #111; }
  h1 { font-size: 15px; margin-bottom: 4px; }
  .sub { color: #555; font-size: 10px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e40af; color: #fff; text-align: left; padding: 5px 6px; font-size: 10px; }
  td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
</style>
</head>
<body>
<h1>Relatório de Extintores</h1>
<p class="sub">Gerado em ${ts}${filtrosAtivos ? ` &nbsp;|&nbsp; Filtros: ${escHtml(filtrosAtivos)}` : ""} &nbsp;|&nbsp; ${rows.length} extintor(es)</p>
<table>
<thead><tr>
  <th>Unidade</th><th>Setor</th><th>Número</th><th>Tipo</th><th>Situação</th>
  <th>Venc. Carga</th><th>Venc. Teste</th><th>Status</th><th>Inspetor</th>
</tr></thead>
<tbody>${tableRows}</tbody>
</table>
</body></html>`;
}

// ── Single extinguisher checklist builders (ficha format) ────────────────────

function montarItensInspecao(ins: Record<string, any>): ItemInspecao[] {
  return [
    { nome: "Lacre",               status: ins.lacre,              observacao: "" },
    { nome: "Vencimento Carga",    status: ins.vencimento_carga,   observacao: "" },
    { nome: "Vencimento Teste",    status: ins.vencimento_teste,   observacao: "" },
    { nome: "Manômetro",           status: ins.manometro,          observacao: "" },
    { nome: "Sinalização Parede",  status: ins.sinalizacao_parede, observacao: "" },
    { nome: "Sinalização Piso",    status: ins.sinalizacao_piso,   observacao: ins.observacoes ?? "" },
    { nome: "Suporte",             status: ins.suporte,            observacao: "" },
    { nome: "Mangueira",           status: ins.mangueira,          observacao: "" },
    { nome: "Quadro de Instrução", status: ins.quadro_instrucao,   observacao: "" },
  ];
}

function montarItensVazios(): ItemInspecao[] {
  return [
    "Lacre", "Vencimento Carga", "Vencimento Teste", "Manômetro",
    "Sinalização Parede", "Sinalização Piso", "Suporte", "Mangueira",
    "Quadro de Instrução",
  ].map((nome) => ({ nome, status: "" as const, observacao: "" }));
}

function escHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
