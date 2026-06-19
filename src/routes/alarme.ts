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

export default router;
