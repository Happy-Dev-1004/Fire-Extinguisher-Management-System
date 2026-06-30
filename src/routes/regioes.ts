// Regional extinguisher management.
// Auth: requireAuth + requireAdmin (owner OR member) at mount point.
//
//   GET    /regioes                      — regions with progress counts
//   GET    /regioes/:regiao/extintores   — extinguishers of a region + status
//   GET    /regioes/:regiao/proximo-numero — next free slot number (add form)
//   GET    /regioes/extintor/:id         — one extinguisher (full)
//   POST   /regioes/extintor             — manually add an extinguisher to a region
//   DELETE /regioes/extintor/:id         — permanently remove an extinguisher
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
import { uploadFotoExtintor } from "../fotos/storage";

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

  // Active cycle info (ciclos has RLS — read via service role).
  const { data: ciclo } = await supabaseAdmin
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

// ── POST /regioes/extintor — manually add a new extinguisher to a region ──────
// For ongoing maintenance: equipment installed later, or correcting the roster.
// numero_int auto-suggests the next free slot but is editable; duplicates within
// the region are rejected. Keeps regioes.total_extintores in sync (+1).
const CriarSchema = z.object({
  regiao:           z.string().min(1, "Região é obrigatória."),
  numero_int:       z.number().int().positive().optional(),  // omitted → next free
  setor:            z.string().optional(),
  tipo_carga:       z.string().optional(),
  capacidade:       z.string().optional(),
  vencimento_carga: z.string().optional(),
  vencimento_teste: z.string().optional(),
});

// Next free per-region slot number = max(numero_int) + 1 (1 when empty).
async function proximoNumeroExtintor(regiao: string): Promise<number> {
  const { data } = await supabase
    .from("extintores").select("numero_int").eq("regiao", regiao)
    .order("numero_int", { ascending: false }).limit(1);
  const maior = (data?.[0] as any)?.numero_int;
  return (typeof maior === "number" && maior > 0 ? maior : 0) + 1;
}

// GET /regioes/:regiao/proximo-numero — what the "add" form should default to.
router.get("/:regiao/proximo-numero", async (req: Request, res: Response) => {
  const regiao = decodeURIComponent(String(req.params.regiao));
  return res.json({ regiao, proximo: await proximoNumeroExtintor(regiao) });
});

router.post("/extintor", async (req: Request, res: Response) => {
  const parsed = CriarSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const { regiao } = parsed.data;

  // The region must exist (we keep its total in sync).
  const { data: reg } = await supabaseAdmin
    .from("regioes").select("nome, total_extintores").eq("nome", regiao).maybeSingle();
  if (!reg) return res.status(404).json({ erro: `Região "${regiao}" não encontrada.` });

  const numeroInt = parsed.data.numero_int ?? await proximoNumeroExtintor(regiao);

  // Reject a duplicate slot number within the region.
  const { data: existente } = await supabase
    .from("extintores").select("id").eq("regiao", regiao).eq("numero_int", numeroInt).maybeSingle();
  if (existente) {
    return res.status(409).json({ erro: `Já existe o extintor nº ${numeroInt} na região ${regiao}.` });
  }

  const novo = {
    numero:           String(numeroInt),
    numero_int:       numeroInt,
    regiao,
    unidade:          regiao,         // legacy mirror column
    setor:            parsed.data.setor ?? "",
    tipo_carga:       parsed.data.tipo_carga ?? "",
    capacidade:       parsed.data.capacidade ?? null,
    vencimento_carga: parsed.data.vencimento_carga ?? null,
    vencimento_teste: parsed.data.vencimento_teste ?? null,
    status_inspecao:  "nao_inspecionado",
    fotos:            [] as string[],
  };
  const { data, error } = await supabase.from("extintores").insert(novo).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });

  // Keep the region's expected total in sync (+1) so progress math stays right.
  await supabaseAdmin
    .from("regioes")
    .update({ total_extintores: ((reg as any).total_extintores ?? 0) + 1 })
    .eq("nome", regiao);

  log.info({ regiao, numeroInt, by: req.admin?.email }, "extintor criado manualmente");
  return res.status(201).json(data);
});

// ── DELETE /regioes/extintor/:id — permanently remove an extinguisher ─────────
// Hard delete (manual data cleanup / equipment removed). Decrements the region
// total so progress stays correct.
router.delete("/extintor/:id", async (req: Request, res: Response) => {
  const { data: ext } = await supabase
    .from("extintores").select("id, regiao").eq("id", req.params.id).maybeSingle();
  if (!ext) return res.status(404).json({ erro: "Extintor não encontrado." });

  const { error } = await supabase.from("extintores").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ erro: error.message });

  // Decrement the region total (never below 0).
  const regiao = (ext as any).regiao as string | null;
  if (regiao) {
    const { data: reg } = await supabaseAdmin
      .from("regioes").select("total_extintores").eq("nome", regiao).maybeSingle();
    if (reg) {
      await supabaseAdmin.from("regioes")
        .update({ total_extintores: Math.max(0, ((reg as any).total_extintores ?? 0) - 1) })
        .eq("nome", regiao);
    }
  }
  log.info({ id: req.params.id, regiao, by: req.admin?.email }, "extintor removido manualmente");
  return res.status(204).end();
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

// ── POST /regioes/extintor/:id/fotos — manual photo upload ─────────────────────
// Human safety net: add photos to an extinguisher from the dashboard (e.g. when
// WhatsApp grouping missed one). Accepts base64 images, downscales + uploads to
// Supabase Storage, and appends the URLs. Marks the slot inspecionado if it was
// empty. Body: { fotos: string[] }  (each a data-URI or base64 string).
const FotosUploadSchema = z.object({
  fotos: z.array(z.string().min(1)).min(1).max(10),
});

router.post("/extintor/:id/fotos", async (req: Request, res: Response) => {
  const parsed = FotosUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Envie de 1 a 10 imagens em base64." });
  }
  const id = String(req.params.id);

  const { data: atual, error: errBusca } = await supabase
    .from("extintores").select("id, fotos, status_inspecao").eq("id", id).maybeSingle();
  if (errBusca) return res.status(500).json({ erro: errBusca.message });
  if (!atual) return res.status(404).json({ erro: "Extintor não encontrado." });

  // Upload each image; keep only the ones that succeed.
  const novasUrls: string[] = [];
  let i = 0;
  for (const b64 of parsed.data.fotos) {
    const suffix = `${Date.now()}_${i++}`;
    const url = await uploadFotoExtintor(id, b64, suffix);
    if (url) novasUrls.push(url);
  }
  if (novasUrls.length === 0) {
    return res.status(502).json({ erro: "Falha ao enviar as imagens. Tente novamente." });
  }

  const fotos = [...(((atual as any).fotos as string[]) ?? []), ...novasUrls];
  const updates: Record<string, unknown> = { fotos };
  // A manually-added photo means the slot now has data → at least awaiting verif.
  if ((atual as any).status_inspecao === "nao_inspecionado") {
    updates.status_inspecao = "aguardando_verificacao";
    updates.inspecionado_em = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("extintores").update(updates).eq("id", id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ id, adicionadas: novasUrls.length, by: req.admin?.email }, "fotos adicionadas manualmente");
  return res.json(data);
});

// ── DELETE /regioes/extintor/:id/fotos — remove one photo by URL ───────────────
const FotoRemoveSchema = z.object({ url: z.string().min(1) });

router.delete("/extintor/:id/fotos", async (req: Request, res: Response) => {
  const parsed = FotoRemoveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Informe a 'url' da foto a remover." });
  const id = String(req.params.id);

  const { data: atual, error: errBusca } = await supabase
    .from("extintores").select("id, fotos").eq("id", id).maybeSingle();
  if (errBusca) return res.status(500).json({ erro: errBusca.message });
  if (!atual) return res.status(404).json({ erro: "Extintor não encontrado." });

  const fotos = (((atual as any).fotos as string[]) ?? []).filter((u) => u !== parsed.data.url);
  const { data, error } = await supabase
    .from("extintores").update({ fotos }).eq("id", id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ id, by: req.admin?.email }, "foto removida manualmente");
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

  // Use the service-role client: ciclos/extintores writes must bypass RLS.
  // This endpoint is already owner-guarded above, so it's a trusted admin op.
  const { data, error } = await supabaseAdmin.rpc("iniciar_novo_ciclo", {
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
  const { data, error } = await supabaseAdmin.rpc("seed_extintores");
  if (error) return res.status(500).json({ erro: error.message });

  // Ensure an active cycle exists after the first seed.
  const { data: ciclo } = await supabaseAdmin.from("ciclos").select("id").eq("status", "ativo").maybeSingle();
  if (!ciclo) {
    const mes = mesAtual();
    await supabaseAdmin.from("ciclos").insert({ mes_referencia: mes, status: "ativo", iniciado_por: req.admin.id });
  }
  log.info({ inseridos: data, by: req.admin.email }, "seed de extintores executado");
  return res.json({ inseridos: data });
});

// ── GET /regioes/pendentes — needing manual assignment ─────────────────────────
router.get("/pendentes", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
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
