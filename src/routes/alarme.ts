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
//   GET    /alarme/cronograma                      — execution schedule per área (central+setor)
//   GET    /alarme/cronograma/pdf                  — schedule as an official PDF (?preview)
//   PUT    /alarme/cronograma                      — set/clear an área's target date
//   /alarme/manutencao …                            — preventive-maintenance visits (CRUD + verificar + fotos + PDF)

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
import { montarCronograma } from "../alarme/cronograma";
import { gerarCronogramaPdf } from "../ficha/gerarCronogramaPdf";
import { ETAPAS_MANUTENCAO, calcularSituacaoManutencao } from "../alarme/manutencao";
import { gerarManutencaoPdf, type VisitaManutencaoPdf } from "../ficha/gerarManutencaoPdf";

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

  // Join the central's numero so results can be ordered Central 1→4 (the join
  // column can't be reliably ordered in SQL via PostgREST, so we sort in JS).
  let q = supabaseAdmin
    .from("dispositivos_alarme")
    .select("*, centrais!inner(numero)")
    .eq("ativo", true);

  if (centralId)            q = q.eq("central_id", centralId);
  if (f.tipo_dispositivo)   q = q.eq("tipo_dispositivo", f.tipo_dispositivo);
  if (f.setor)              q = q.ilike("setor", `%${f.setor}%`);
  if (f.status_instalacao)  q = q.eq("status_instalacao", f.status_instalacao);

  const { data, error } = await q;
  if (error) {
    log.error({ err: error.message }, "erro ao listar dispositivos");
    return res.status(500).json({ erro: "Erro ao buscar dispositivos." });
  }

  // Order: Central (1→4) → tipo → laço → setor → endereço. Empty/null sorts last.
  const cmpNum = (a: number | null, b: number | null) =>
    a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b;
  const cmpStr = (a: string | null, b: string | null) => {
    const x = a ?? "", y = b ?? "";
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return x.localeCompare(y, "pt-BR");
  };
  const dispositivos = (data ?? [])
    .map((d: any) => ({ ...d, _central_numero: d.centrais?.numero ?? null }))
    .sort((a: any, b: any) =>
      cmpNum(a._central_numero, b._central_numero) ||
      cmpStr(a.tipo_dispositivo, b.tipo_dispositivo) ||
      cmpNum(a.laco ?? null, b.laco ?? null) ||
      cmpStr(a.setor, b.setor) ||
      cmpStr(a.endereco, b.endereco)
    )
    // strip the join helpers so the response shape stays unchanged
    .map(({ centrais, _central_numero, ...rest }: any) => rest);

  return res.json({ dispositivos });
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

// ── Execution schedule (cronograma por área) ────────────────────────────────
// One row per (central + setor): the target delivery date + live install
// progress computed from the devices. "Área" = central+setor pair.
//   GET /alarme/cronograma        — areas with progress + target date + status
//   PUT /alarme/cronograma        — set/clear the target date for one area
router.get("/cronograma", async (_req: Request, res: Response) => {
  try {
    const areas = await montarCronograma();
    return res.json({ areas });
  } catch (err: any) {
    log.error({ err: err.message }, "erro ao montar cronograma");
    return res.status(500).json({ erro: "Erro ao carregar o cronograma." });
  }
});

// ── GET /alarme/cronograma/pdf — official schedule report (?preview=true) ─────
router.get("/cronograma/pdf", async (req: Request, res: Response) => {
  try {
    const areas = await montarCronograma();
    const pdf = await gerarCronogramaPdf(areas);
    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="cronograma_alarme_${ts}.pdf"`);
    return res.send(pdf);
  } catch (err: any) {
    log.error({ err: err.message }, "erro ao gerar PDF do cronograma");
    return res.status(500).json({ erro: "Erro ao gerar o PDF do cronograma." });
  }
});

const CronogramaSchema = z.object({
  central_id:    z.string().uuid(),
  setor:         z.string().min(1),
  data_prevista: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), // ISO date or null to clear
  observacoes:   z.string().optional(),
  // Área já possui equipamento no sistema antigo? true=Sim, false=Não, null=limpa.
  sistema_antigo: z.boolean().nullable().optional(),
});

router.put("/cronograma", async (req: Request, res: Response) => {
  const parsed = CronogramaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  const { central_id, setor } = parsed.data;

  // Only overwrite the fields actually sent, so saving one (date OR the flag)
  // never clears the other. central_id+setor identify the row.
  const row: Record<string, unknown> = { central_id, setor };
  if ("data_prevista" in parsed.data)  row.data_prevista  = parsed.data.data_prevista ?? null;
  if (parsed.data.observacoes !== undefined)    row.observacoes    = parsed.data.observacoes;
  if (parsed.data.sistema_antigo !== undefined) row.sistema_antigo = parsed.data.sistema_antigo;
  const { data, error } = await supabaseAdmin
    .from("cronograma_alarme").upsert(row, { onConflict: "central_id,setor" }).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ central_id, setor, data_prevista: row.data_prevista, by: req.admin?.email }, "cronograma de área atualizado");
  return res.json(data);
});

// ── Manutenção preventiva do alarme (visitas periódicas) ─────────────────────
// One visit = one central, with the 7-step flowchart checklist. Mirrors the
// periodic-inspection model of Fases 1/3 (registro → verificação → PDF → envio).
//   GET    /alarme/manutencao                 — list visits (+ situação, central)
//   GET    /alarme/manutencao/:id             — one visit
//   POST   /alarme/manutencao                 — create a visit
//   PUT    /alarme/manutencao/:id             — edit a visit
//   POST   /alarme/manutencao/:id/verificar   — mark verificado / undo
//   POST   /alarme/manutencao/:id/fotos       — add photos (base64)
//   DELETE /alarme/manutencao/:id/fotos       — remove one photo by url
//   DELETE /alarme/manutencao/:id             — delete a visit
//   GET    /alarme/manutencao/:id/pdf         — official report PDF (?preview)

const ETAPA_ENUM = z.enum(["OK", "NC", "N.A", ""]).optional();
const ManutencaoBodySchema = z.object({
  central_id:        z.string().uuid().optional(),
  data_visita:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tecnicos:          z.string().optional(),
  responsavel:       z.string().optional(),
  e1_planejamento:   ETAPA_ENUM,
  e2_preparacao:     ETAPA_ENUM,
  e3_inspecao_visual:ETAPA_ENUM,
  e4_testes:         ETAPA_ENUM,
  e5_verificacoes:   ETAPA_ENUM,
  e6_ajustes:        ETAPA_ENUM,
  e7_relatorio:      ETAPA_ENUM,
  observacoes_etapas:z.record(z.string(), z.string()).optional(),
  nao_conformidades: z.string().optional(),
  recomendacoes:     z.string().optional(),
  observacoes:       z.string().optional(),
});

// Shapes a DB row for the API: adds situação + the joined central number/name.
function mapVisita(v: any) {
  return {
    ...v,
    central_numero: v.centrais?.numero ?? null,
    central_nome:   v.centrais?.nome ?? null,
    situacao:       calcularSituacaoManutencao(v),
  };
}

router.get("/manutencao", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("visitas_manutencao_alarme")
    .select("*, centrais!inner(numero, nome)")
    .order("data_visita", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  return res.json({ visitas: (data ?? []).map(mapVisita) });
});

router.get("/manutencao/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("visitas_manutencao_alarme").select("*, centrais!inner(numero, nome)")
    .eq("id", req.params.id).maybeSingle();
  if (error) return res.status(500).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Visita não encontrada." });
  return res.json(mapVisita(data));
});

router.post("/manutencao", async (req: Request, res: Response) => {
  const parsed = ManutencaoBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  if (!parsed.data.central_id) return res.status(400).json({ erro: "central_id é obrigatório." });

  const preenchida = ETAPAS_MANUTENCAO.some((e) => (parsed.data as any)[e.chave]);
  const novo = {
    ...parsed.data,
    status: preenchida ? "aguardando_verificacao" : "rascunho",
    fotos: [] as string[],
  };
  const { data, error } = await supabaseAdmin
    .from("visitas_manutencao_alarme").insert(novo).select("*, centrais!inner(numero, nome)").maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ id: (data as any)?.id, by: req.admin?.email }, "visita de manutenção criada");
  return res.status(201).json(mapVisita(data));
});

router.put("/manutencao/:id", async (req: Request, res: Response) => {
  const parsed = ManutencaoBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  const updates: Record<string, unknown> = { ...parsed.data };

  // Filling any step moves a rascunho to 'aguardando_verificacao'.
  const { data: atual } = await supabaseAdmin
    .from("visitas_manutencao_alarme").select("status").eq("id", req.params.id).maybeSingle();
  const preencheuEtapa = ETAPAS_MANUTENCAO.some((e) => e.chave in parsed.data);
  if (preencheuEtapa && (atual as any)?.status === "rascunho") updates.status = "aguardando_verificacao";

  const { data, error } = await supabaseAdmin
    .from("visitas_manutencao_alarme").update(updates).eq("id", req.params.id)
    .select("*, centrais!inner(numero, nome)").maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Visita não encontrada." });
  log.info({ id: req.params.id, by: req.admin?.email }, "visita de manutenção editada");
  return res.json(mapVisita(data));
});

router.post("/manutencao/:id/verificar", async (req: Request, res: Response) => {
  const parsed = z.object({ verificado: z.boolean().default(true) }).safeParse(req.body ?? {});
  const verificar = parsed.success ? parsed.data.verificado : true;
  const updates = verificar
    ? { status: "verificado", verificado_por: req.admin?.id ?? null, verificado_em: new Date().toISOString() }
    : { status: "aguardando_verificacao", verificado_por: null, verificado_em: null };
  const { data, error } = await supabaseAdmin
    .from("visitas_manutencao_alarme").update(updates).eq("id", req.params.id)
    .neq("status", "rascunho").select("*, centrais!inner(numero, nome)").maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(409).json({ erro: "Visita ainda em rascunho — preencha o checklist antes de verificar." });
  return res.json(mapVisita(data));
});

const FotosVisitaSchema = z.object({ fotos: z.array(z.string().min(1)).min(1).max(10) });
router.post("/manutencao/:id/fotos", async (req: Request, res: Response) => {
  const parsed = FotosVisitaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Envie de 1 a 10 imagens em base64." });
  const id = String(req.params.id);
  const { data: atual } = await supabaseAdmin
    .from("visitas_manutencao_alarme").select("id, fotos").eq("id", id).maybeSingle();
  if (!atual) return res.status(404).json({ erro: "Visita não encontrada." });

  const novasUrls: string[] = [];
  let i = 0;
  for (const b64 of parsed.data.fotos) {
    const url = await uploadFotoBase64(`manutencao/${id}`, b64, `${Date.now()}_${i++}`);
    if (url) novasUrls.push(url);
  }
  if (novasUrls.length === 0) return res.status(502).json({ erro: "Falha ao enviar as imagens." });
  const fotos = [...(((atual as any).fotos as string[]) ?? []), ...novasUrls];
  const { data, error } = await supabaseAdmin
    .from("visitas_manutencao_alarme").update({ fotos }).eq("id", id)
    .select("*, centrais!inner(numero, nome)").maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  return res.json(mapVisita(data));
});

router.delete("/manutencao/:id/fotos", async (req: Request, res: Response) => {
  const parsed = z.object({ url: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Informe a 'url' da foto a remover." });
  const id = String(req.params.id);
  const { data: atual } = await supabaseAdmin
    .from("visitas_manutencao_alarme").select("id, fotos").eq("id", id).maybeSingle();
  if (!atual) return res.status(404).json({ erro: "Visita não encontrada." });
  const fotos = (((atual as any).fotos as string[]) ?? []).filter((u) => u !== parsed.data.url);
  const { data, error } = await supabaseAdmin
    .from("visitas_manutencao_alarme").update({ fotos }).eq("id", id)
    .select("*, centrais!inner(numero, nome)").maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  return res.json(mapVisita(data));
});

router.delete("/manutencao/:id", async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin.from("visitas_manutencao_alarme").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ id: req.params.id, by: req.admin?.email }, "visita de manutenção removida");
  return res.status(204).end();
});

router.get("/manutencao/:id/pdf", async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("visitas_manutencao_alarme").select("*, centrais!inner(numero, nome)")
    .eq("id", req.params.id).maybeSingle();
  if (error) return res.status(500).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Visita não encontrada." });
  const v = data as any;
  const dados: VisitaManutencaoPdf = {
    central_numero: v.centrais?.numero ?? null,
    central_nome:   v.centrais?.nome ?? null,
    data_visita:    v.data_visita ?? null,
    tecnicos:       v.tecnicos ?? null,
    responsavel:    v.responsavel ?? null,
    etapas:         Object.fromEntries(ETAPAS_MANUTENCAO.map((e) => [e.chave, v[e.chave] ?? ""])) as any,
    observacoes_etapas: v.observacoes_etapas ?? {},
    nao_conformidades: v.nao_conformidades ?? null,
    recomendacoes:  v.recomendacoes ?? null,
    observacoes:    v.observacoes ?? null,
    fotos:          Array.isArray(v.fotos) ? v.fotos : [],
  };
  const pdf = await gerarManutencaoPdf(dados, { semFotos: req.query.preview === "true" });
  const ts = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="manutencao_central${dados.central_numero ?? ""}_${ts}.pdf"`);
  return res.send(pdf);
});

export default router;
