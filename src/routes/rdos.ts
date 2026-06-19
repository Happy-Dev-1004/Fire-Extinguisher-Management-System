// Read API for captured RDOs (Relatório Diário de Obra).
// Guards at mount point: requireAuth + requireAdmin.
//
//   GET /rdos              — list (filter by status, data, telefone_origem)
//   GET /rdos/:id          — one RDO
//   GET /rdos/sessoes/ativas — active capture sessions (debug/ops visibility)

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";

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

router.get("/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin.from("rdos").select("*").eq("id", req.params.id).maybeSingle();
  if (error) return res.status(500).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "RDO não encontrado." });
  return res.json(data);
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
