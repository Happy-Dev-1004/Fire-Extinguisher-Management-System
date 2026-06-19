// Read API for captured RDOs (Relatório Diário de Obra).
// Guards at mount point: requireAuth + requireAdmin.
//
//   GET  /rdos                      — list (filter by status, data, telefone_origem)
//   GET  /rdos/:id                  — one RDO
//   GET  /rdos/:id/pdf              — render the RDO as a branded PDF (inline)
//   GET  /rdos/:id/dispositivos-instalados — devices installed that day + links
//   GET  /rdos/destinatarios        — preview who will receive an RDO
//   POST /rdos/:id/enviar           — generate + send PDF (WhatsApp / email / ambos)
//   GET  /rdos/sessoes/ativas       — active capture sessions (debug/ops visibility)

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { gerarRdoPdf } from "../rdo/gerarPdf";
import { enviarRdo, UNIDADE_RDO } from "../rdo/enviarRdo";
import { resolverDestinatarios } from "../destinatarios/resolver";
import { rdosParaCsv, rdosParaPdf, type RdoResumo } from "../alarme/relatorioAlarme";

const router = Router();
const log = logger.child({ rota: "/rdos" });

const FiltrosSchema = z.object({
  status:          z.enum(["em_andamento", "concluido", "cancelado"]).optional(),
  data:            z.string().date().optional(),
  telefone_origem: z.string().optional(),
});

router.get("/", async (req: Request, res: Response) => {
  const parsed = FiltrosSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Filtros inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const f = parsed.data;
  let q = supabaseAdmin.from("rdos").select("*").order("created_at", { ascending: false });
  if (f.status)          q = q.eq("status", f.status);
  if (f.data)            q = q.eq("data", f.data);
  if (f.telefone_origem) q = q.eq("telefone_origem", f.telefone_origem);

  const { data, error } = await q;
  if (error) {
    log.error({ err: error.message }, "erro ao listar rdos");
    return res.status(500).json({ erro: "Erro ao buscar RDOs." });
  }
  return res.json({ rdos: data ?? [] });
});

router.get("/sessoes/ativas", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("rdo_sessoes")
    .select("telefone_normalizado, rdo_id, etapa, aguardando_fotos, atualizado_em")
    .order("atualizado_em", { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  return res.json({ sessoes: data ?? [] });
});

// Preview the RDO recipient list (static path — declared before "/:id").
router.get("/destinatarios", async (_req: Request, res: Response) => {
  const destinatarios = await resolverDestinatarios(UNIDADE_RDO);
  return res.json({ unidade: UNIDADE_RDO, destinatarios });
});

// ── RDO list → report (CSV or PDF) — e.g. "RDOs de junho" via ?mes=2026-06 ───────
const RelatorioRdoSchema = z.object({
  status:  z.enum(["em_andamento", "concluido", "cancelado"]).optional(),
  mes:     z.string().regex(/^\d{4}-\d{2}$/, "Use o formato AAAA-MM.").optional(),
  data:    z.string().date().optional(),
  formato: z.enum(["pdf", "csv"]).default("pdf"),
});

router.get("/relatorio", async (req: Request, res: Response) => {
  const parsed = RelatorioRdoSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Filtros inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const f = parsed.data;

  let q = supabaseAdmin
    .from("rdos")
    .select("id, data, responsavel, central, frente_trabalho, status, dispositivos_instalados, fotos_dia")
    .order("data", { ascending: false });
  if (f.status) q = q.eq("status", f.status);
  if (f.data) q = q.eq("data", f.data);
  if (f.mes) {
    // Month window [first day, first day of next month).
    const [y, m] = f.mes.split("-").map(Number);
    const ini = `${f.mes}-01`;
    const prox = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    q = q.gte("data", ini).lt("data", prox);
  }

  const { data, error } = await q;
  if (error) {
    log.error({ err: error.message }, "erro ao gerar relatório de RDOs");
    return res.status(500).json({ erro: "Erro ao gerar relatório de RDOs." });
  }
  const rows = (data ?? []) as RdoResumo[];

  const subtituloPartes: string[] = [];
  if (f.mes)    subtituloPartes.push(`Mês ${f.mes}`);
  if (f.data)   subtituloPartes.push(`Data ${f.data}`);
  if (f.status) subtituloPartes.push(`Status ${f.status}`);
  const subtitulo = subtituloPartes.length ? `Filtros: ${subtituloPartes.join(" · ")}` : "Todos os RDOs";
  const ts = new Date().toISOString().slice(0, 10);

  if (f.formato === "csv") {
    const csv = rdosParaCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="rdos_${ts}.csv"`);
    return res.send(csv);
  }
  const pdf = await rdosParaPdf(rows, subtitulo);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="rdos_${ts}.pdf"`);
  return res.send(pdf);
});

router.get("/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin.from("rdos").select("*").eq("id", req.params.id).maybeSingle();
  if (error) return res.status(500).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "RDO não encontrado." });
  return res.json(data);
});

// ── RDO PDF (inline) ──────────────────────────────────────────────────────────
router.get("/:id/pdf", async (req: Request, res: Response) => {
  const result = await gerarRdoPdf(String(req.params.id));
  if (!result.ok) {
    const status = result.motivo === "RDO não encontrado." ? 404 : 500;
    return res.status(status).json({ erro: result.motivo });
  }
  const fileName = `rdo_${(result.data ?? "sem-data").replace(/\//g, "-")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
  return res.send(result.pdfBuffer);
});

// ── Send the RDO PDF to recipients (WhatsApp / email / ambos) ─────────────────
const EnviarRdoSchema = z.object({
  canal: z.enum(["whatsapp", "email", "ambos"]).default("ambos"),
});

router.post("/:id/enviar", async (req: Request, res: Response) => {
  const parsed = EnviarRdoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const resultado = await enviarRdo(String(req.params.id), parsed.data.canal);
  const { status, ok, ...payload } = resultado;
  void ok;
  return res.status(status).json(payload);
});

// ── RDO ↔ device photo-record link ────────────────────────────────────────────
// Returns the devices installed on this RDO's date (optionally scoped to the
// RDO's central), each with its photo gallery + dashboard link. This is the
// "the RDO links to the device photo records" requirement: a supervisor opening
// an RDO sees exactly which devices were photographed/installed that day.
router.get("/:id/dispositivos-instalados", async (req: Request, res: Response) => {
  const { data: rdo, error } = await supabaseAdmin
    .from("rdos").select("id, data, central").eq("id", req.params.id).maybeSingle();
  if (error) return res.status(500).json({ erro: error.message });
  if (!rdo) return res.status(404).json({ erro: "RDO não encontrado." });
  if (!(rdo as any).data) {
    return res.json({ rdo_id: req.params.id, data: null, total: 0, dispositivos: [] });
  }

  // Try to scope by the RDO's central. `central` is free text (e.g. "Central 3 -
  // Fábrica"); pull the first 1-4 number out of it, if present.
  const centralMatch = String((rdo as any).central ?? "").match(/\b([1-4])\b/);
  let centralId: string | undefined;
  if (centralMatch) {
    const { data: c } = await supabaseAdmin
      .from("centrais").select("id").eq("numero", Number(centralMatch[1])).maybeSingle();
    if (c) centralId = (c as any).id;
  }

  let q = supabaseAdmin
    .from("dispositivos_alarme")
    .select("id, central_id, laco, endereco, tipo_dispositivo, setor, status_instalacao, data_instalacao, fotos")
    .eq("ativo", true)
    .eq("data_instalacao", (rdo as any).data)
    .order("setor");
  if (centralId) q = q.eq("central_id", centralId);

  const { data: disps, error: dErr } = await q;
  if (dErr) {
    log.error({ err: dErr.message }, "erro ao buscar dispositivos instalados do RDO");
    return res.status(500).json({ erro: "Erro ao buscar dispositivos." });
  }

  const dispositivos = (disps ?? []).map((d: any) => ({
    ...d,
    qtd_fotos: (d.fotos ?? []).length,
    link_galeria: `/alarme/dispositivos/${d.id}`,
  }));
  return res.json({
    rdo_id: req.params.id,
    data: (rdo as any).data,
    central: (rdo as any).central ?? null,
    total: dispositivos.length,
    dispositivos,
  });
});

export default router;
