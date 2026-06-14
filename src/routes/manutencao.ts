// Owner-only maintenance endpoints.
//
// Auth enforced at mount point in index.ts: requireAuth + requireOwner.
//
// POST /manutencao/varrer-lotes
//   Forces the orphaned-batch sweep on demand and returns a JSON summary.
//   This exists because the in-memory auto-close timer does not survive a
//   redeploy: any batch left 'aberto' when the server restarted would sit
//   unprocessed forever. Calling this closes every stale batch and triggers
//   its AI analysis, independent of timers or the WhatsApp "fim" command.

import { Router, type Request, type Response } from "express";
import { supabase } from "../db";
import { logger } from "../logger";
import { varrerLotesAbandonados } from "./webhook";

const router = Router();
const log = logger.child({ rota: "/manutencao" });

// POST /manutencao/varrer-lotes
router.post("/varrer-lotes", async (_req: Request, res: Response) => {
  log.info("varredura de lotes solicitada via HTTP");

  // Snapshot before/after so the caller can see what changed.
  const { data: antes } = await supabase
    .from("lotes_fotos")
    .select("status")
    .eq("status", "aberto");

  try {
    await varrerLotesAbandonados();
  } catch (err: any) {
    log.error({ err: err.message }, "falha na varredura via HTTP");
    return res.status(500).json({ erro: err.message });
  }

  // Give analysis a moment to flip statuses, then report the spread.
  await new Promise((r) => setTimeout(r, 1500));

  const { data: spread } = await supabase
    .from("lotes_fotos")
    .select("status");

  const contagem: Record<string, number> = {};
  for (const row of spread ?? []) {
    const s = (row as any).status as string;
    contagem[s] = (contagem[s] ?? 0) + 1;
  }

  return res.json({
    abertos_antes: antes?.length ?? 0,
    contagem_por_status: contagem,
    nota: "Análise roda em segundo plano; reconsulte em alguns segundos para ver 'processado'.",
  });
});

export default router;
