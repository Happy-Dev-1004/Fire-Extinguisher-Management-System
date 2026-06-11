// Auth enforced at mount point in index.ts: requireAuth + requireAdmin
// Extintores are NEVER created/modified via API — they come from the AI analysis pipeline.

import { Router, type Request, type Response } from "express";
import { supabase } from "../db";
import { logger } from "../logger";
import { calcularSituacao, type Situacao } from "../extintores/situacao";

const router = Router();
const log = logger.child({ rota: "/extintores" });

// ── GET /extintores ───────────────────────────────────────────────────────────
// Returns all extinguishers with:
//   - computed situacao
//   - latest inspection summary (status_geral, data_inspecao, tem_irregularidade, inspetor)
// Query params:
//   unidade   — filter by exact unidade name
//   situacao  — filter by computed situacao (vencido | proximo | em_dia | descartado | indeterminado)
router.get("/", async (req: Request, res: Response) => {
  const { unidade, situacao: filtroSituacao } = req.query as Record<string, string | undefined>;

  // Fetch all extinguishers
  let q = supabase
    .from("extintores")
    .select("*")
    .order("unidade")
    .order("numero");

  if (unidade) q = q.eq("unidade", unidade);

  const { data: extintores, error: errExt } = await q;
  if (errExt) {
    log.error({ err: errExt.message }, "erro ao listar extintores");
    return res.status(500).json({ erro: "Erro ao buscar extintores." });
  }

  if (!extintores || extintores.length === 0) {
    return res.json({ extintores: [] });
  }

  // Fetch latest inspection per extinguisher in one query (subquery via RPC not available,
  // so we fetch all and group in JS — the table is small and this avoids N+1).
  const numeros   = [...new Set(extintores.map((e: any) => e.numero))];
  const unidades  = [...new Set(extintores.map((e: any) => e.unidade))];

  const { data: inspecoes, error: errInsp } = await supabase
    .from("inspecoes")
    .select("extintor_numero, extintor_unidade, status_geral, data_inspecao, tem_irregularidade, inspetor, mes_referencia")
    .in("extintor_numero", numeros)
    .in("extintor_unidade", unidades)
    .order("data_inspecao", { ascending: false });

  if (errInsp) {
    log.warn({ err: errInsp.message }, "erro ao buscar inspeções — prosseguindo sem resumo");
  }

  // Build latest-inspection map keyed by "numero|unidade"
  const latestMap = new Map<string, any>();
  for (const insp of (inspecoes ?? [])) {
    const key = `${insp.extintor_numero}|${insp.extintor_unidade}`;
    if (!latestMap.has(key)) latestMap.set(key, insp); // already ordered desc
  }

  // Compute situacao and attach inspection summary
  const resultado = extintores.map((e: any) => {
    const situacao: Situacao = calcularSituacao(e);
    const latest = latestMap.get(`${e.numero}|${e.unidade}`) ?? null;
    return {
      ...e,
      situacao,
      ultima_inspecao: latest
        ? {
            status_geral:      latest.status_geral,
            data_inspecao:     latest.data_inspecao,
            tem_irregularidade: latest.tem_irregularidade,
            inspetor:          latest.inspetor,
            mes_referencia:    latest.mes_referencia,
          }
        : null,
    };
  });

  // Apply situacao filter AFTER computing (avoids a second DB query)
  const filtrado = filtroSituacao
    ? resultado.filter((e: any) => e.situacao === filtroSituacao)
    : resultado;

  return res.json({ extintores: filtrado });
});

// ── GET /extintores/:id ───────────────────────────────────────────────────────
// Full detail: extinguisher + ALL inspections (newest first)
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: extintor, error: errExt } = await supabase
    .from("extintores")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (errExt || !extintor) {
    return res.status(404).json({ erro: "Extintor não encontrado." });
  }

  const { data: inspecoes, error: errInsp } = await supabase
    .from("inspecoes")
    .select("*")
    .eq("extintor_numero", extintor.numero)
    .eq("extintor_unidade", extintor.unidade)
    .order("data_inspecao", { ascending: false });

  if (errInsp) {
    log.warn({ err: errInsp.message, id }, "erro ao buscar inspeções do extintor");
  }

  const situacao: Situacao = calcularSituacao(extintor);

  return res.json({
    extintor: { ...extintor, situacao },
    inspecoes: inspecoes ?? [],
  });
});

export default router;
