import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";

const router = Router();
const log = logger.child({ rota: "/me" });

// GET /me
// Returns the current admin's public profile.
// requireAuth attaches req.admin; this handler just serialises it.
router.get("/", requireAuth, (req: Request, res: Response) => {
  const { email, nome, role } = req.admin!;
  return res.json({ email, nome, role });
});

// GET /me/atividade-recente
// Combined recent-activity feed for the dashboard: the latest RDOs (Fase 2) and
// the latest extinguisher inspections (Fase 1), merged into one timeline sorted
// by date. Never throws — a failure on one source still returns the other.
interface ItemAtividade {
  tipo: "rdo" | "inspecao";
  id: string;
  data: string | null;          // ISO date used for sorting/display
  titulo: string;
  descricao: string;
  status?: string | null;
  link: string;                 // dashboard route
}

router.get("/atividade-recente", requireAuth, async (_req: Request, res: Response) => {
  const itens: ItemAtividade[] = [];

  // ── Latest RDOs (Fase 2) ──
  try {
    const { data, error } = await supabaseAdmin
      .from("rdos")
      .select("id, data, responsavel, central, status, dispositivos_instalados, created_at")
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as any[]) {
      const total = r.dispositivos_instalados
        ? Object.values(r.dispositivos_instalados).reduce((s: number, n: any) => s + (Number(n) || 0), 0)
        : 0;
      itens.push({
        tipo: "rdo",
        id: r.id,
        data: r.data ?? (r.created_at ? String(r.created_at).slice(0, 10) : null),
        titulo: "Relatório diário de obra (RDO)",
        descricao: `${r.responsavel ?? "—"}${r.central ? ` · ${r.central}` : ""} · ${total} dispositivo(s)`,
        status: r.status ?? null,
        link: "/alarme/rdos",
      });
    }
  } catch (err: any) {
    log.warn({ err: err.message }, "atividade-recente: falha ao buscar RDOs");
  }

  // ── Latest inspections (Fase 1) ──
  try {
    const { data, error } = await supabaseAdmin
      .from("inspecoes")
      .select("id, extintor_numero, extintor_unidade, data_inspecao, inspetor, status_geral, tem_irregularidade")
      .order("data_inspecao", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    for (const i of (data ?? []) as any[]) {
      itens.push({
        tipo: "inspecao",
        id: i.id,
        data: i.data_inspecao ?? null,
        titulo: `Inspeção · Extintor ${i.extintor_numero ?? "—"}`,
        descricao: `${i.extintor_unidade ?? "—"}${i.inspetor ? ` · ${i.inspetor}` : ""}${i.tem_irregularidade ? " · com irregularidade" : ""}`,
        status: i.status_geral ?? null,
        link: "/busca",
      });
    }
  } catch (err: any) {
    log.warn({ err: err.message }, "atividade-recente: falha ao buscar inspeções");
  }

  // Merge + sort by date desc (nulls last), cap to 10.
  itens.sort((a, b) => {
    if (!a.data) return 1;
    if (!b.data) return -1;
    return a.data < b.data ? 1 : a.data > b.data ? -1 : 0;
  });

  return res.json({ itens: itens.slice(0, 10) });
});

export default router;
