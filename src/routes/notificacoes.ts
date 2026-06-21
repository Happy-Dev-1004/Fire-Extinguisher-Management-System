// Notification center + system-health API.
//
//   GET  /notificacoes              — list recent notifications + unread count
//   POST /notificacoes/:id/lida     — mark one read
//   POST /notificacoes/ler-todas    — mark all read
//   GET  /notificacoes/saude        — OpenAI/Z-API health snapshot (OWNER only)
//
// Mounted with requireAuth + requireAdmin. Health is gated to owner inside the
// handler. Activity notifications are visible to admins (owner + members);
// 'owner'-scoped rows (health/credit) are hidden from members.

import { Router, type Request, type Response } from "express";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { snapshotSaude } from "../notificacao/saude";

const router = Router();
const log = logger.child({ rota: "/notificacoes" });

// Members only see 'admin'-scoped notifications; the owner sees everything.
function escoposVisiveis(req: Request): string[] {
  return req.admin?.role === "owner" ? ["admin", "owner"] : ["admin"];
}

router.get("/", async (req: Request, res: Response) => {
  const escopos = escoposVisiveis(req);
  const { data, error } = await supabaseAdmin
    .from("notificacoes")
    .select("id, tipo, severidade, titulo, mensagem, metadata, contador, lida, created_at, atualizado_em")
    .in("escopo", escopos)
    .order("lida")                                   // unread first
    .order("atualizado_em", { ascending: false })
    .limit(50);
  if (error) {
    log.error({ err: error.message }, "erro ao listar notificações");
    return res.status(500).json({ erro: "Erro ao buscar notificações." });
  }
  const itens = data ?? [];
  const naoLidas = itens.filter((n: any) => !n.lida).length;
  return res.json({ notificacoes: itens, nao_lidas: naoLidas });
});

router.post("/:id/lida", async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from("notificacoes")
    .update({ lida: true, atualizado_em: new Date().toISOString() })
    .eq("id", req.params.id)
    .in("escopo", escoposVisiveis(req));
  if (error) return res.status(400).json({ erro: error.message });
  return res.json({ ok: true });
});

router.post("/ler-todas", async (req: Request, res: Response) => {
  const { error } = await supabaseAdmin
    .from("notificacoes")
    .update({ lida: true, atualizado_em: new Date().toISOString() })
    .eq("lida", false)
    .in("escopo", escoposVisiveis(req));
  if (error) return res.status(400).json({ erro: error.message });
  return res.json({ ok: true });
});

// ── System health (OWNER only) ─────────────────────────────────────────────────
router.get("/saude", async (req: Request, res: Response) => {
  if (req.admin?.role !== "owner") {
    return res.status(403).json({ erro: "Apenas o proprietário pode ver a saúde do sistema." });
  }
  try {
    const snap = await snapshotSaude();
    return res.json(snap);
  } catch (err: any) {
    log.error({ err: err.message }, "erro ao gerar snapshot de saúde");
    return res.status(500).json({ erro: "Erro ao verificar a saúde do sistema." });
  }
});

export default router;
