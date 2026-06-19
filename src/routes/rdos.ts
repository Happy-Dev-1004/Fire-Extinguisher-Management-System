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

export default router;
