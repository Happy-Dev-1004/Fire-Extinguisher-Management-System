// PHASE 2 — fire-alarm installation registry.
// Guards applied at mount point in index.ts: requireAuth + requireAdmin.
//
//   GET    /alarme/centrais                       — list panels
//   PUT    /alarme/centrais/:id                   — edit panel (nome, area, modelo, ativo)
//   GET    /alarme/dispositivos                   — list devices (filters)
//   GET    /alarme/dispositivos/:id               — one device
//   POST   /alarme/dispositivos                   — create device (endereco/laco optional)
//   PUT    /alarme/dispositivos/:id               — edit device
//   DELETE /alarme/dispositivos/:id               — soft-delete (ativo=false)
//   POST   /alarme/seed                            — run idempotent device seed (OWNER)
//   GET    /alarme/reconciliacao                  — BOM gap report

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { seedDispositivosAlarme } from "../alarme/seed";
import { reconciliar, resumoTexto } from "../alarme/reconciliacao";
import { uploadFotoBase64 } from "../fotos/storage";
import { relatorioArmazenamento } from "../alarme/armazenamento";
import { agregarProgresso, type DispositivoProgresso } from "../alarme/progresso";
import { buscarDispositivos, FiltrosAlarmeSchema } from "../alarme/buscaAlarme";
import { dispositivosParaCsv, dispositivosParaPdf } from "../alarme/relatorioAlarme";

const router = Router();
const log = logger.child({ rota: "/alarme" });

const TIPOS = [
  "detector_fumaca", "detector_temperatura", "detector_linear",
  "acionador", "sirene", "modulo_supervisao", "isolador", "outro",
] as const;
const STATUS = ["pendente", "instalado", "enderecado", "testado"] as const;

// ── Centrais ───────────────────────────────────────────────────────────────────
router.get("/centrais", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("centrais")
    .select("id, numero, nome, area_cobertura, modelo, ativo, created_at")
    .order("numero");
  if (error) {
    log.error({ err: error.message }, "erro ao listar centrais");
    return res.status(500).json({ erro: "Erro ao buscar centrais." });
  }
  return res.json({ centrais: data ?? [] });
});

const CentralEditSchema = z.object({
  nome:           z.string().min(1).optional(),
  area_cobertura: z.string().optional(),
  modelo:         z.string().nullable().optional(),
  ativo:          z.boolean().optional(),
});

router.put("/centrais/:id", async (req: Request, res: Response) => {
  const parsed = CentralEditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const { data, error } = await supabaseAdmin
    .from("centrais").update(parsed.data).eq("id", req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Central não encontrada." });
  return res.json(data);
});

// ── Dispositivos ────────────────────────────────────────────────────────────────
const FiltrosSchema = z.object({
  central_id:        z.string().min(1).optional(),
  central_numero:    z.coerce.number().int().min(1).max(99).optional(),
  tipo_dispositivo:  z.enum(TIPOS).optional(),
  setor:             z.string().optional(),
  status_instalacao: z.enum(STATUS).optional(),
});

router.get("/dispositivos", async (req: Request, res: Response) => {
  const parsed = FiltrosSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Filtros inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const f = parsed.data;

  // Resolve central_numero → central_id if provided.
  let centralId = f.central_id;
  if (!centralId && f.central_numero) {
    const { data: c } = await supabaseAdmin
      .from("centrais").select("id").eq("numero", f.central_numero).maybeSingle();
    if (!c) return res.json({ dispositivos: [] });
    centralId = (c as any).id;
  }

  let q = supabaseAdmin
    .from("dispositivos_alarme")
    .select("*")
    .eq("ativo", true)
    .order("tipo_dispositivo")
    .order("setor")
    .order("created_at");

  if (centralId)            q = q.eq("central_id", centralId);
  if (f.tipo_dispositivo)   q = q.eq("tipo_dispositivo", f.tipo_dispositivo);
  if (f.setor)              q = q.ilike("setor", `%${f.setor}%`);
  if (f.status_instalacao)  q = q.eq("status_instalacao", f.status_instalacao);

  const { data, error } = await q;
  if (error) {
    log.error({ err: error.message }, "erro ao listar dispositivos");
    return res.status(500).json({ erro: "Erro ao buscar dispositivos." });
  }
  return res.json({ dispositivos: data ?? [] });
});

router.get("/dispositivos/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("dispositivos_alarme").select("*").eq("id", req.params.id).maybeSingle();
  if (error) return res.status(500).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Dispositivo não encontrado." });
  return res.json(data);
});

// endereco and laco are OPTIONAL/NULLABLE — a device can be registered now and
// addressed later (incremental data). Only central_id + tipo + setor are required.
const DispositivoBodySchema = z.object({
  // Not z.uuid(): the central's existence is verified against the DB below, and
  // zod v4's uuid() rejects some valid-enough ids on its variant check. min(1)
  // + the FK + the existence lookup are the real guard.
  central_id:        z.string().min(1, "central_id é obrigatório."),
  laco:              z.coerce.number().int().positive().nullable().optional(),
  endereco:          z.string().trim().nullable().optional(),
  tipo_dispositivo:  z.enum(TIPOS),
  setor:             z.string().min(1, "Setor é obrigatório."),
  descricao:         z.string().nullable().optional(),
  status_instalacao: z.enum(STATUS).optional(),
  data_instalacao:   z.string().date().nullable().optional(),
  observacoes:       z.string().nullable().optional(),
});

router.post("/dispositivos", async (req: Request, res: Response) => {
  const parsed = DispositivoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const body = parsed.data;

  // The central must exist (FK would error anyway; give a clear message).
  const { data: central } = await supabaseAdmin
    .from("centrais").select("id").eq("id", body.central_id).maybeSingle();
  if (!central) return res.status(400).json({ erro: "Central informada não existe." });

  // cadastro_pendente is true until BOTH endereco and laco are known.
  const completo = !!body.endereco && body.laco != null;
  const { data, error } = await supabaseAdmin
    .from("dispositivos_alarme")
    .insert({ ...body, cadastro_pendente: !completo })
    .select().single();
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ id: data.id, tipo: body.tipo_dispositivo, by: req.admin?.email }, "dispositivo criado");
  return res.status(201).json(data);
});

const DispositivoEditSchema = DispositivoBodySchema.partial();

router.put("/dispositivos/:id", async (req: Request, res: Response) => {
  const parsed = DispositivoEditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const updates: Record<string, unknown> = { ...parsed.data };

  // Recompute cadastro_pendente from the resulting endereco/laco.
  const { data: atual } = await supabaseAdmin
    .from("dispositivos_alarme").select("endereco, laco").eq("id", req.params.id).maybeSingle();
  if (!atual) return res.status(404).json({ erro: "Dispositivo não encontrado." });
  const endereco = ("endereco" in updates ? updates.endereco : (atual as any).endereco) as string | null;
  const laco     = ("laco" in updates ? updates.laco : (atual as any).laco) as number | null;
  updates.cadastro_pendente = !(endereco && laco != null);

  const { data, error } = await supabaseAdmin
    .from("dispositivos_alarme").update(updates).eq("id", req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Dispositivo não encontrado." });
  return res.json(data);
});

// Soft-delete: keep the row for audit, set ativo=false (never lose data).
router.delete("/dispositivos/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("dispositivos_alarme").update({ ativo: false }).eq("id", req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Dispositivo não encontrado." });
  log.info({ id: req.params.id, by: req.admin?.email }, "dispositivo desativado (soft-delete)");
  return res.status(204).send();
});

// ── Seed (OWNER only) ────────────────────────────────────────────────────────────
router.post("/seed", async (req: Request, res: Response) => {
  if (req.admin?.role !== "owner") {
    return res.status(403).json({ erro: "Apenas o proprietário pode semear os dispositivos." });
  }
  try {
    const resultado = await seedDispositivosAlarme();
    log.info({ ...resultado, by: req.admin.email }, "seed de alarme executado");
    return res.json(resultado);
  } catch (err: any) {
    log.error({ err: err.message }, "falha no seed de alarme");
    return res.status(500).json({ erro: err.message });
  }
});

// ── Reconciliation (BOM gap report) ──────────────────────────────────────────────
router.get("/reconciliacao", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("dispositivos_alarme")
    .select("tipo_dispositivo")
    .eq("ativo", true);
  if (error) {
    log.error({ err: error.message }, "erro ao reconciliar");
    return res.status(500).json({ erro: "Erro ao gerar reconciliação." });
  }
  const contagens: Record<string, number> = {};
  for (const row of (data ?? []) as any[]) {
    contagens[row.tipo_dispositivo] = (contagens[row.tipo_dispositivo] ?? 0) + 1;
  }
  const rec = reconciliar(contagens);
  return res.json({ ...rec, resumo: resumoTexto(rec) });
});

// ── Devices installed on a given date (the RDO ↔ photo-record link) ───────────────
// Returns every device whose data_instalacao == :data (optionally scoped to a
// central), each with its photo gallery URLs and a dashboard link. This is what
// an RDO references for "the devices installed on its day".
const InstaladosSchema = z.object({
  data:           z.string().date(),
  central_numero: z.coerce.number().int().min(1).max(99).optional(),
});

router.get("/dispositivos-instalados", async (req: Request, res: Response) => {
  const parsed = InstaladosSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Parâmetros inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const { data: dataISO, central_numero } = parsed.data;

  let centralId: string | undefined;
  if (central_numero) {
    const { data: c } = await supabaseAdmin
      .from("centrais").select("id").eq("numero", central_numero).maybeSingle();
    if (!c) return res.json({ data: dataISO, total: 0, dispositivos: [] });
    centralId = (c as any).id;
  }

  let q = supabaseAdmin
    .from("dispositivos_alarme")
    .select("id, central_id, laco, endereco, tipo_dispositivo, setor, status_instalacao, data_instalacao, fotos")
    .eq("ativo", true)
    .eq("data_instalacao", dataISO)
    .order("setor");
  if (centralId) q = q.eq("central_id", centralId);

  const { data, error } = await q;
  if (error) {
    log.error({ err: error.message }, "erro ao listar dispositivos instalados na data");
    return res.status(500).json({ erro: "Erro ao buscar dispositivos." });
  }

  const dispositivos = (data ?? []).map((d: any) => ({
    ...d,
    qtd_fotos: (d.fotos ?? []).length,
    link_galeria: `/alarme/dispositivos/${d.id}`, // dashboard route to its gallery
  }));
  return res.json({ data: dataISO, total: dispositivos.length, dispositivos });
});

// ── Manual photo attach/remove for a device (dashboard safety net) ────────────────
const FotosBodySchema = z.object({
  fotos: z.array(z.string().min(1)).min(1, "Envie ao menos uma foto."), // base64/data-URI
});

router.post("/dispositivos/:id/fotos", async (req: Request, res: Response) => {
  const parsed = FotosBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const { data: disp } = await supabaseAdmin
    .from("dispositivos_alarme").select("id, fotos, status_instalacao, data_instalacao")
    .eq("id", req.params.id).maybeSingle();
  if (!disp) return res.status(404).json({ erro: "Dispositivo não encontrado." });

  const urls: string[] = [];
  for (let i = 0; i < parsed.data.fotos.length; i++) {
    const url = await uploadFotoBase64(`dispositivos/${req.params.id}`, parsed.data.fotos[i], `manual-${i}`);
    if (url) urls.push(url);
  }
  if (urls.length === 0) return res.status(502).json({ erro: "Falha ao processar as fotos." });

  const hoje = new Date().toISOString().slice(0, 10);
  const novas = [ ...(((disp as any).fotos as string[]) ?? []), ...urls ];
  const { data, error } = await supabaseAdmin
    .from("dispositivos_alarme")
    .update({
      fotos: novas,
      status_instalacao: (disp as any).status_instalacao === "pendente" ? "instalado" : (disp as any).status_instalacao,
      data_instalacao: (disp as any).data_instalacao ?? hoje,
    })
    .eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ id: req.params.id, adicionadas: urls.length, by: req.admin?.email }, "fotos adicionadas ao dispositivo");
  return res.json(data);
});

const RemoverFotoSchema = z.object({ url: z.string().min(1) });

router.delete("/dispositivos/:id/fotos", async (req: Request, res: Response) => {
  const parsed = RemoverFotoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Informe a url da foto.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const { data: disp } = await supabaseAdmin
    .from("dispositivos_alarme").select("fotos").eq("id", req.params.id).maybeSingle();
  if (!disp) return res.status(404).json({ erro: "Dispositivo não encontrado." });
  const novas = (((disp as any).fotos as string[]) ?? []).filter((u) => u !== parsed.data.url);
  const { data, error } = await supabaseAdmin
    .from("dispositivos_alarme").update({ fotos: novas }).eq("id", req.params.id).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ id: req.params.id, by: req.admin?.email }, "foto removida do dispositivo");
  return res.json(data);
});

// ── Orphan device photos awaiting review (never lost) ─────────────────────────────
router.get("/fotos-pendentes", async (req: Request, res: Response) => {
  const resolvido = req.query.resolvido === "true";
  const { data, error } = await supabaseAdmin
    .from("dispositivo_fotos_pendentes")
    .select("*")
    .eq("resolvido", resolvido)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  return res.json({ pendentes: data ?? [] });
});

// Assign an orphan photo to a device (resolves it): appends to the device's
// gallery and marks the pending row resolved.
const AtribuirSchema = z.object({ dispositivo_id: z.string().min(1) });

router.post("/fotos-pendentes/:id/atribuir", async (req: Request, res: Response) => {
  const parsed = AtribuirSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const { data: pend } = await supabaseAdmin
    .from("dispositivo_fotos_pendentes").select("*").eq("id", req.params.id).maybeSingle();
  if (!pend) return res.status(404).json({ erro: "Foto pendente não encontrada." });
  if ((pend as any).resolvido) return res.status(409).json({ erro: "Esta foto já foi resolvida." });

  const { error: rpcErr } = await supabaseAdmin.rpc("append_foto_dispositivo", {
    p_id: parsed.data.dispositivo_id,
    p_foto: (pend as any).foto_url,
  });
  if (rpcErr) return res.status(400).json({ erro: rpcErr.message });

  await supabaseAdmin
    .from("dispositivo_fotos_pendentes")
    .update({ resolvido: true, dispositivo_id: parsed.data.dispositivo_id })
    .eq("id", req.params.id);
  log.info({ pendenteId: req.params.id, dispositivoId: parsed.data.dispositivo_id, by: req.admin?.email },
    "foto pendente atribuída a dispositivo");
  return res.json({ ok: true });
});

// ── Device search (filter → results, paginated) ─────────────────────────────────────
router.get("/busca", async (req: Request, res: Response) => {
  const parsed = FiltrosAlarmeSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Filtros inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  try {
    const pagina = await buscarDispositivos(parsed.data);
    return res.json(pagina);
  } catch (err: any) {
    log.error({ err: err.message }, "erro na busca de dispositivos");
    return res.status(500).json({ erro: "Erro ao buscar dispositivos." });
  }
});

// ── Device search → report (CSV or PDF) ─────────────────────────────────────────────
router.get("/busca/relatorio", async (req: Request, res: Response) => {
  const formato = (req.query.formato as string) === "csv" ? "csv" : "pdf";
  const parsed = FiltrosAlarmeSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Filtros inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  try {
    const { resultados } = await buscarDispositivos(parsed.data, { todas: true });
    const partes: string[] = [];
    if (parsed.data.central_numero) partes.push(`Central ${parsed.data.central_numero}`);
    if (parsed.data.tipo_dispositivo) partes.push(parsed.data.tipo_dispositivo);
    if (parsed.data.status_instalacao) partes.push(parsed.data.status_instalacao);
    if (parsed.data.setor) partes.push(`setor ${parsed.data.setor}`);
    const subtitulo = partes.length ? `Filtros: ${partes.join(" · ")}` : "Todos os dispositivos ativos";
    const ts = new Date().toISOString().slice(0, 10);

    if (formato === "csv") {
      const csv = dispositivosParaCsv(resultados);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="dispositivos_${ts}.csv"`);
      return res.send(csv);
    }
    const pdf = await dispositivosParaPdf(resultados, subtitulo);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="dispositivos_${ts}.pdf"`);
    return res.send(pdf);
  } catch (err: any) {
    log.error({ err: err.message }, "erro ao gerar relatório de dispositivos");
    return res.status(500).json({ erro: "Erro ao gerar relatório." });
  }
});

// ── Install-progress dashboard data ────────────────────────────────────────────────
// Per central + per loop status counts, overall progress, and BOM gaps. Null-safe:
// devices with no central/laço fall into "sem" buckets and never break the math.
router.get("/progresso", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("dispositivos_alarme")
    .select("tipo_dispositivo, status_instalacao, laco, centrais!inner(numero, nome)")
    .eq("ativo", true);
  if (error) {
    log.error({ err: error.message }, "erro ao agregar progresso");
    return res.status(500).json({ erro: "Erro ao gerar progresso de instalação." });
  }

  const dispositivos: DispositivoProgresso[] = (data ?? []).map((d: any) => ({
    central_numero: d.centrais?.numero ?? null,
    central_nome: d.centrais?.nome ?? null,
    laco: d.laco ?? null,
    tipo_dispositivo: d.tipo_dispositivo,
    status_instalacao: d.status_instalacao ?? null,
  }));

  const contagensPorTipo: Record<string, number> = {};
  for (const d of dispositivos) {
    contagensPorTipo[d.tipo_dispositivo] = (contagensPorTipo[d.tipo_dispositivo] ?? 0) + 1;
  }

  return res.json(agregarProgresso(dispositivos, contagensPorTipo));
});

// ── Storage usage report ──────────────────────────────────────────────────────────
// ~500 devices × several photos each → awareness of storage growth. Reports
// counts and estimated bytes (from the storage objects), plus an archive note.
router.get("/armazenamento", async (_req: Request, res: Response) => {
  try {
    const relatorio = await relatorioArmazenamento();
    return res.json(relatorio);
  } catch (err: any) {
    log.error({ err: err.message }, "erro ao gerar relatório de armazenamento");
    return res.status(500).json({ erro: "Erro ao gerar relatório de armazenamento." });
  }
});

export default router;
