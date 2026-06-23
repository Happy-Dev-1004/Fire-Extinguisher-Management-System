// Manage hydrant units (Phase 3) — name + hydrant count. The owner defines these
// (e.g. "EDP" with N hydrants), then runs the hydrant seed to create the slots.
// Guards at mount point: requireAuth + requireAdmin. Writes are owner-only.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { limparCacheUnidadesHidrante } from "../regioes/unidadesHidrante";

const router = Router();
const log = logger.child({ rota: "/unidades-hidrante" });

router.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("unidades_hidrante").select("id, nome, total_hidrantes, ordem, created_at").order("ordem");
  if (error) return res.status(500).json({ erro: error.message });
  return res.json({ unidades: data ?? [] });
});

const BodySchema = z.object({
  nome:            z.string().min(1, "Nome é obrigatório."),
  total_hidrantes: z.coerce.number().int().min(0).max(100000),
  ordem:           z.coerce.number().int().optional(),
});

router.post("/", async (req: Request, res: Response) => {
  if (req.admin?.role !== "owner") return res.status(403).json({ erro: "Apenas o proprietário pode criar unidades." });
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  const { data, error } = await supabaseAdmin
    .from("unidades_hidrante").insert(parsed.data).select().single();
  if (error) return res.status(400).json({ erro: error.message });
  limparCacheUnidadesHidrante();
  log.info({ nome: parsed.data.nome, by: req.admin.email }, "unidade de hidrante criada");
  return res.status(201).json(data);
});

router.put("/:id", async (req: Request, res: Response) => {
  if (req.admin?.role !== "owner") return res.status(403).json({ erro: "Apenas o proprietário pode editar unidades." });
  const parsed = BodySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  const { data, error } = await supabaseAdmin
    .from("unidades_hidrante").update(parsed.data).eq("id", req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Unidade não encontrada." });
  limparCacheUnidadesHidrante();
  return res.json(data);
});

router.delete("/:id", async (req: Request, res: Response) => {
  if (req.admin?.role !== "owner") return res.status(403).json({ erro: "Apenas o proprietário pode remover unidades." });
  const { error } = await supabaseAdmin.from("unidades_hidrante").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ erro: error.message });
  limparCacheUnidadesHidrante();
  log.info({ id: req.params.id, by: req.admin.email }, "unidade de hidrante removida");
  return res.status(204).send();
});

export default router;
