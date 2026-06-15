// Regional extinguisher management.
// Auth: requireAuth + requireAdmin (owner OR member) at mount point.
//
//   GET    /regioes                      — regions with progress counts
//   GET    /regioes/:regiao/extintores   — extinguishers of a region + status
//   GET    /regioes/extintor/:id         — one extinguisher (full)
//   PUT    /regioes/extintor/:id         — edit an extinguisher's values
//   POST   /regioes/extintor/:id/verificar   — mark Verificado (or un-verify)
//   POST   /regioes/novo-mes             — archive + reset (OWNER only, guarded in handler)
//   POST   /regioes/seed                 — create the 695 slots (OWNER only, guarded)
//   GET    /regioes/pendentes            — analysed batches needing manual slot assignment

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabase } from "../db";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { calcularSituacao } from "../extintores/situacao";

const router = Router();
const log = logger.child({ rota: "/regioes" });

const STATUS_VALIDOS = ["nao_inspecionado", "aguardando_verificacao", "verificado"] as const;

// ── GET /regioes — regions with progress ──────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  const { data: regioes, error } = await supabaseAdmin
    .from("regioes")
    .select("nome, total_extintores, ordem")
    .order("ordem");
  if (error) return res.status(500).json({ erro: error.message });

  // Status counts per region in one query.
  const { data: counts } = await supabase
    .from("extintores")
    .select("regiao, status_inspecao")
    .not("regiao", "is", null);

  const porRegiao = new Map<string, { aguardando: number; verificado: number; nao: number; total: number }>();
  for (const row of (counts ?? []) as any[]) {
    const r = porRegiao.get(row.regiao) ?? { aguardando: 0, verificado: 0, nao: 0, total: 0 };
    r.total++;
    if (row.status_inspecao === "verificado") r.verificado++;
    else if (row.status_inspecao === "aguardando_verificacao") r.aguardando++;
    else r.nao++;
    porRegiao.set(row.regiao, r);
  }

  const resultado = (regioes ?? []).map((reg: any) => {
    const c = porRegiao.get(reg.nome) ?? { aguardando: 0, verificado: 0, nao: 0, total: 0 };
    const inspecionados = c.aguardando + c.verificado;
    return {
      nome:             reg.nome,
      total_esperado:   reg.total_extintores,
      total_cadastrado: c.total,
      nao_inspecionado: c.nao + Math.max(0, reg.total_extintores - c.total),
      aguardando_verificacao: c.aguardando,
      verificado:       c.verificado,
      inspecionados,
      pct_inspecionado: reg.total_extintores ? Math.round((inspecionados / reg.total_extintores) * 100) : 0,
      pct_verificado:   reg.total_extintores ? Math.round((c.verificado / reg.total_extintores) * 100) : 0,
    };
  });

  // Active cycle info
  const { data: ciclo } = await supabase
    .from("ciclos").select("id, mes_referencia, iniciado_em").eq("status", "ativo").maybeSingle();

  return res.json({ regioes: resultado, ciclo: ciclo ?? null });
});

// ── GET /regioes/:regiao/extintores ───────────────────────────────────────────
router.get("/:regiao/extintores", async (req: Request, res: Response) => {
  const regiao = decodeURIComponent(String(req.params.regiao));
  const { data, error } = await supabase
    .from("extintores")
    .select("*")
    .eq("regiao", regiao)
    .order("numero_int", { ascending: true });
  if (error) return res.status(500).json({ erro: error.message });

  const extintores = (data ?? []).map((e: any) => ({
    ...e,
    situacao: calcularSituacao({
      status_ativo: e.status_ativo ?? true,
      vencimento_carga: e.vencimento_carga,
      vencimento_teste: e.vencimento_teste,
      numero: e.numero,
      unidade: e.regiao,
    }),
  }));
  return res.json({ regiao, extintores });
});

// ── GET /regioes/extintor/:id ─────────────────────────────────────────────────
router.get("/extintor/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabase.from("extintores").select("*").eq("id", req.params.id).maybeSingle();
  if (error) return res.status(500).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Extintor não encontrado." });
  const e = data as any;
  const situacao = calcularSituacao({
    status_ativo: e.status_ativo ?? true,
    vencimento_carga: e.vencimento_carga,
    vencimento_teste: e.vencimento_teste,
    numero: e.numero,
    unidade: e.regiao,
  });
  return res.json({ ...e, situacao });
});

// ── PUT /regioes/extintor/:id — manual edit ───────────────────────────────────
const EditSchema = z.object({
  setor:             z.string().optional(),
  tipo_carga:        z.string().optional(),
  capacidade:        z.string().optional(),
  vencimento_carga:  z.string().optional(),
  vencimento_teste:  z.string().optional(),
  inspetor:          z.string().optional(),
  lacre:             z.string().optional(),
  manometro:         z.string().optional(),
  sinalizacao_parede:z.string().optional(),
  sinalizacao_piso:  z.string().optional(),
  suporte:           z.string().optional(),
  mangueira:         z.string().optional(),
  quadro_instrucao:  z.string().optional(),
  status_geral:      z.string().optional(),
  observacoes:       z.string().optional(),
});

router.put("/extintor/:id", async (req: Request, res: Response) => {
  const parsed = EditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  // A manual edit means the extinguisher now has values — at least
  // 'aguardando_verificacao'. It does NOT auto-verify; the user confirms
  // separately with the verificar button.
  const updates: Record<string, unknown> = { ...parsed.data };
  const { data: atual } = await supabase
    .from("extintores").select("status_inspecao").eq("id", req.params.id).maybeSingle();
  if ((atual as any)?.status_inspecao === "nao_inspecionado") {
    updates.status_inspecao = "aguardando_verificacao";
    updates.inspecionado_em = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("extintores").update(updates).eq("id", req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Extintor não encontrado." });
  log.info({ id: req.params.id, by: req.admin?.email }, "extintor editado manualmente");
  return res.json(data);
});

// ── POST /regioes/extintor/:id/verificar ──────────────────────────────────────
const VerificarSchema = z.object({ verificado: z.boolean().default(true) });

router.post("/extintor/:id/verificar", async (req: Request, res: Response) => {
  const parsed = VerificarSchema.safeParse(req.body ?? {});
  const verificar = parsed.success ? parsed.data.verificado : true;

  const updates = verificar
    ? { status_inspecao: "verificado", verificado_por: req.admin?.id ?? null, verificado_em: new Date().toISOString() }
    : { status_inspecao: "aguardando_verificacao", verificado_por: null, verificado_em: null };

  const { data, error } = await supabase
    .from("extintores").update(updates).eq("id", req.params.id)
    // Can't verify something that was never inspected.
    .neq("status_inspecao", "nao_inspecionado")
    .select().maybeSingle();

  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(409).json({ erro: "Extintor não inspecionado ainda — não pode ser verificado." });
  log.info({ id: req.params.id, verificar, by: req.admin?.email }, "status de verificação alterado");
  return res.json(data);
});

// ── POST /regioes/novo-mes — archive + reset (OWNER only) ──────────────────────
const NovoMesSchema = z.object({ mes_referencia: z.string().min(1) });

router.post("/novo-mes", async (req: Request, res: Response) => {
  if (req.admin?.role !== "owner") {
    return res.status(403).json({ erro: "Apenas o proprietário pode iniciar um novo mês." });
  }
  const parsed = NovoMesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "mes_referencia é obrigatório (ex: Julho/2026)." });

  const { data, error } = await supabase.rpc("iniciar_novo_ciclo", {
    p_mes: parsed.data.mes_referencia,
    p_by:  req.admin.id,
  });
  if (error) return res.status(500).json({ erro: error.message });
  log.info({ ciclo: data, mes: parsed.data.mes_referencia, by: req.admin.email }, "novo ciclo iniciado");
  return res.json({ ciclo_id: data, mes_referencia: parsed.data.mes_referencia });
});

// ── POST /regioes/seed — create the 695 slots (OWNER only) ─────────────────────
router.post("/seed", async (req: Request, res: Response) => {
  if (req.admin?.role !== "owner") {
    return res.status(403).json({ erro: "Apenas o proprietário pode semear o inventário." });
  }
  const { data, error } = await supabase.rpc("seed_extintores");
  if (error) return res.status(500).json({ erro: error.message });

  // Ensure an active cycle exists after the first seed.
  const { data: ciclo } = await supabase.from("ciclos").select("id").eq("status", "ativo").maybeSingle();
  if (!ciclo) {
    const mes = mesAtual();
    await supabase.from("ciclos").insert({ mes_referencia: mes, status: "ativo", iniciado_por: req.admin.id });
  }
  log.info({ inseridos: data, by: req.admin.email }, "seed de extintores executado");
  return res.json({ inseridos: data });
});

// ── GET /regioes/pendentes — needing manual assignment ─────────────────────────
router.get("/pendentes", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("inspecoes_pendentes").select("*").eq("resolvido", false).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  return res.json({ pendentes: data ?? [] });
});

function mesAtual(): string {
  const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const d = new Date();
  return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
}

export const STATUS_INSPECAO = STATUS_VALIDOS;
export default router;
