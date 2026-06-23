// PHASE 3 — fire-hydrant inspection (hidrantes). Mirrors /regioes (extinguishers)
// for the hydrant model. Guards at mount point: requireAuth + requireAdmin.
//
//   GET    /hidrantes                       — units with progress counts + cycle
//   GET    /hidrantes/pendentes             — parked AI results (manual assign)
//   GET    /hidrantes/busca                  — filter hydrants across units (paginated)
//   GET    /hidrantes/unidade/:unidade      — hydrants of a unit (+ situação)
//   GET    /hidrantes/:id                   — one hydrant (+ situação)
//   PUT    /hidrantes/:id                   — manual edit
//   POST   /hidrantes/:id/verificar         — mark verificado / un-verify
//   POST   /hidrantes/:id/fotos             — add photos (base64)
//   DELETE /hidrantes/:id/fotos             — remove one photo by url
//   POST   /hidrantes/novo-mes              — archive + reset (OWNER)
//   POST   /hidrantes/seed                  — create the slots (OWNER)
//   GET    /hidrantes/ficha/:unidade        — unit ficha PDF (?preview=true light)
//   GET    /hidrantes/ficha/:unidade/destinatarios — preview recipients
//   POST   /hidrantes/ficha/:unidade/enviar — send ficha to recipients (wa/email)

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { uploadFotoBase64 } from "../fotos/storage";
import { calcularSituacaoHidrante } from "../extintores/situacaoHidrante";
import { gerarFichaUnidadeHidrante } from "../ficha/gerarFichaUnidadeHidrante";
import { limparCacheUnidadesHidrante } from "../regioes/unidadesHidrante";
import { resolverDestinatarios } from "../destinatarios/resolver";
import { enviarFichaWhatsApp } from "../notificacao/enviarFicha";
import { enviarFichaEmail } from "../notificacao/enviarFichaEmail";

const router = Router();
const log = logger.child({ rota: "/hidrantes" });

const ITEM_KEYS = [
  "c_esguicho", "c_condicoes_caixa", "c_condicoes_acesso", "c_identificacao_piso",
  "c_identificacao_placa", "c_mangueira", "c_adaptador", "c_chave_storz",
  "c_teste", "c_tampa_hidrante",
] as const;

// ── GET /hidrantes — units + progress ────────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  const { data: unidades, error } = await supabaseAdmin
    .from("unidades_hidrante").select("nome, total_hidrantes, ordem").order("ordem");
  if (error) return res.status(500).json({ erro: error.message });

  const { data: counts } = await supabaseAdmin
    .from("hidrantes").select("unidade, status_inspecao").not("unidade", "is", null);

  const porUnidade = new Map<string, { aguardando: number; verificado: number; nao: number; total: number }>();
  for (const row of (counts ?? []) as any[]) {
    const r = porUnidade.get(row.unidade) ?? { aguardando: 0, verificado: 0, nao: 0, total: 0 };
    r.total++;
    if (row.status_inspecao === "verificado") r.verificado++;
    else if (row.status_inspecao === "aguardando_verificacao") r.aguardando++;
    else r.nao++;
    porUnidade.set(row.unidade, r);
  }

  const resultado = (unidades ?? []).map((u: any) => {
    const c = porUnidade.get(u.nome) ?? { aguardando: 0, verificado: 0, nao: 0, total: 0 };
    const inspecionados = c.aguardando + c.verificado;
    return {
      nome: u.nome,
      total_esperado: u.total_hidrantes,
      total_cadastrado: c.total,
      nao_inspecionado: c.nao + Math.max(0, u.total_hidrantes - c.total),
      aguardando_verificacao: c.aguardando,
      verificado: c.verificado,
      inspecionados,
      pct_inspecionado: u.total_hidrantes ? Math.round((inspecionados / u.total_hidrantes) * 100) : 0,
      pct_verificado: u.total_hidrantes ? Math.round((c.verificado / u.total_hidrantes) * 100) : 0,
    };
  });

  const { data: ciclo } = await supabaseAdmin
    .from("ciclos_hidrante").select("id, mes_referencia, iniciado_em").eq("status", "ativo").maybeSingle();
  return res.json({ unidades: resultado, ciclo: ciclo ?? null });
});

// ── GET /hidrantes/pendentes ─────────────────────────────────────────────────
router.get("/pendentes", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("inspecoes_pendentes_hidrante").select("*").eq("resolvido", false).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  return res.json({ pendentes: data ?? [] });
});

// ── GET /hidrantes/unidade/:unidade ──────────────────────────────────────────
router.get("/unidade/:unidade", async (req: Request, res: Response) => {
  const unidade = decodeURIComponent(String(req.params.unidade));
  const { data, error } = await supabaseAdmin
    .from("hidrantes").select("*").eq("unidade", unidade).order("numero_int", { ascending: true });
  if (error) return res.status(500).json({ erro: error.message });
  const hidrantes = (data ?? []).map((h: any) => ({ ...h, situacao: calcularSituacaoHidrante(h) }));
  return res.json({ unidade, hidrantes });
});

// ── GET /hidrantes/ficha/:unidade — unit ficha PDF ───────────────────────────
router.get("/ficha/:unidade", async (req: Request, res: Response) => {
  const unidade = decodeURIComponent(String(req.params.unidade));
  const preview = req.query.preview === "true";
  const result = await gerarFichaUnidadeHidrante(unidade, { semFotos: preview });
  if (!result.ok) return res.status(404).json({ erro: result.motivo });
  const ts = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="hidrantes_${unidade.replace(/\s+/g, "_")}_${ts}.pdf"`);
  return res.send(result.pdfBuffer);
});

// Resolve the active cycle's reference month (used as the ficha's "mês").
async function mesDoCicloAtivo(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("ciclos_hidrante").select("mes_referencia").eq("status", "ativo").maybeSingle();
  return (data as any)?.mes_referencia ?? "";
}

// ── GET /hidrantes/ficha/:unidade/destinatarios — preview recipients ─────────
router.get("/ficha/:unidade/destinatarios", async (req: Request, res: Response) => {
  const unidade = decodeURIComponent(String(req.params.unidade));
  const destinatarios = await resolverDestinatarios(unidade);
  return res.json({ unidade, destinatarios });
});

// ── POST /hidrantes/ficha/:unidade/enviar — send the ficha to recipients ─────
// Generates the hydrant ficha PDF and sends it to all resolved recipients of
// the unit (WhatsApp and/or e-mail). Mirrors POST /ficha/enviar (Phase 1).
const EnviarHidranteSchema = z.object({
  canal: z.enum(["whatsapp", "email", "ambos"]).default("ambos"),
});

router.post("/ficha/:unidade/enviar", async (req: Request, res: Response) => {
  const unidade = decodeURIComponent(String(req.params.unidade));
  const parsed = EnviarHidranteSchema.safeParse(req.body ?? {});
  const canal = parsed.success ? parsed.data.canal : "ambos";
  const log = logger.child({ rota: "/hidrantes/ficha/enviar", unidade, canal });

  const destinatarios = await resolverDestinatarios(unidade);
  if (destinatarios.length === 0) {
    return res.status(422).json({
      erro: `Nenhum destinatário configurado para a unidade "${unidade}". Cadastre ao menos um destinatário ativo antes de enviar.`,
    });
  }

  const ficha = await gerarFichaUnidadeHidrante(unidade, { semFotos: false });
  if (!ficha.ok) return res.status(404).json({ erro: ficha.motivo });

  const mes = await mesDoCicloAtivo();
  const assunto = `Ficha de inspeção mensal dos hidrantes — ${unidade}${mes ? ` — ${mes}` : ""}`;

  const usarWhats = canal === "ambos" || canal === "whatsapp";
  const usarEmail = canal === "ambos" || canal === "email";
  const comTelefone = usarWhats ? destinatarios.filter((d) => d.telefone_normalizado)    : [];
  const comEmail    = usarEmail ? destinatarios.filter((d) => d.email && d.email.trim())  : [];

  const [resWhats, resEmail] = await Promise.all([
    comTelefone.length
      ? enviarFichaWhatsApp({ unidade, mes, pdfBuffer: ficha.pdfBuffer, destinatarios: comTelefone, assunto, prefixoArquivo: "hidrantes" })
      : Promise.resolve([]),
    comEmail.length
      ? enviarFichaEmail({ unidade, mes, pdfBuffer: ficha.pdfBuffer, destinatarios: comEmail, assunto, prefixoArquivo: "hidrantes", descricaoItem: "dos hidrantes" })
      : Promise.resolve([]),
  ]);

  const whatsById = new Map(resWhats.map((r) => [r.destinatario.id, r]));
  const emailById = new Map(resEmail.map((r) => [r.destinatario.id, r]));
  const detalhes = destinatarios.map((d) => {
    const w = whatsById.get(d.id);
    const e = emailById.get(d.id);
    return {
      destinatario: { id: d.id, nome: d.nome, telefone: d.telefone, email: d.email ?? null },
      whatsapp: (usarWhats && d.telefone_normalizado)
        ? { tentado: true, ok: w?.ok ?? false, motivo: w?.motivo }
        : { tentado: false, ok: false },
      email: (usarEmail && d.email && d.email.trim())
        ? { tentado: true, ok: e?.ok ?? false, motivo: e?.motivo }
        : { tentado: false, ok: false },
    };
  });

  const sucessoCompleto = detalhes.filter(
    (d) => (!d.whatsapp.tentado || d.whatsapp.ok) && (!d.email.tentado || d.email.ok)
  ).length;
  const comFalha = detalhes.length - sucessoCompleto;
  const whatsOk = resWhats.filter((r) => r.ok).length;
  const emailOk = resEmail.filter((r) => r.ok).length;

  log.info({ total: destinatarios.length, sucessoCompleto, comFalha, whatsOk, emailOk }, "ficha de hidrantes enviada");
  return res.json({
    mensagem: `Ficha entregue a ${sucessoCompleto} de ${destinatarios.length} destinatário(s) (WhatsApp: ${whatsOk}, e-mail: ${emailOk}).`,
    enviados: sucessoCompleto,
    falhas:   comFalha,
    detalhes,
  });
});

// ── GET /hidrantes/busca — filter hydrants across all units ──────────────────
// Hydrants have no expiry dates, so situação is checklist-derived. Filters:
//   unidade, numero, setor, inspetor (partial), situacao, status_inspecao.
const BuscaSchema = z.object({
  unidade:         z.string().optional(),
  numero:          z.string().optional(),
  setor:           z.string().optional(),
  inspetor:        z.string().optional(),
  situacao:        z.enum(["atencao", "pendente", "ok", "indeterminado"]).optional(),
  status_inspecao: z.enum(["nao_inspecionado", "aguardando_verificacao", "verificado"]).optional(),
  page:            z.coerce.number().int().min(1).default(1),
});
const POR_PAGINA = 50;

router.get("/busca", async (req: Request, res: Response) => {
  const parsed = BuscaSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ erro: "Filtros inválidos." });
  const f = parsed.data;

  let query = supabaseAdmin.from("hidrantes").select("*").not("unidade", "is", null);
  if (f.unidade)         query = query.eq("unidade", f.unidade);
  if (f.status_inspecao) query = query.eq("status_inspecao", f.status_inspecao);
  if (f.numero)          query = query.ilike("numero", `%${f.numero}%`);
  if (f.setor)           query = query.ilike("setor", `%${f.setor}%`);
  if (f.inspetor)        query = query.ilike("inspetor", `%${f.inspetor}%`);

  const { data, error } = await query.order("unidade").order("numero_int", { ascending: true });
  if (error) return res.status(500).json({ erro: error.message });

  // situação is computed in app code → filter + count after fetch.
  let linhas = (data ?? []).map((h: any) => ({ ...h, situacao: calcularSituacaoHidrante(h) }));
  if (f.situacao) linhas = linhas.filter((h) => h.situacao === f.situacao);

  const contagens = {
    total: linhas.length,
    atencao:       linhas.filter((h) => h.situacao === "atencao").length,
    pendente:      linhas.filter((h) => h.situacao === "pendente").length,
    ok:            linhas.filter((h) => h.situacao === "ok").length,
    indeterminado: linhas.filter((h) => h.situacao === "indeterminado").length,
  };

  const total = linhas.length;
  const total_paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(f.page, total_paginas);
  const resultados = linhas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  return res.json({ resultados, total, pagina, total_paginas, contagens });
});

// ── GET /hidrantes/:id ───────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin.from("hidrantes").select("*").eq("id", req.params.id).maybeSingle();
  if (error) return res.status(500).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Hidrante não encontrado." });
  return res.json({ ...(data as any), situacao: calcularSituacaoHidrante(data as any) });
});

// ── PUT /hidrantes/:id — manual edit ─────────────────────────────────────────
const EditSchema = z.object({
  setor:        z.string().optional(),
  esguicho:     z.string().optional(),
  mangueira:    z.string().optional(),
  chave_storz:  z.string().optional(),
  c_esguicho:            z.string().optional(),
  c_condicoes_caixa:     z.string().optional(),
  c_condicoes_acesso:    z.string().optional(),
  c_identificacao_piso:  z.string().optional(),
  c_identificacao_placa: z.string().optional(),
  c_mangueira:           z.string().optional(),
  c_adaptador:           z.string().optional(),
  c_chave_storz:         z.string().optional(),
  c_teste:               z.string().optional(),
  c_tampa_hidrante:      z.string().optional(),
  status_geral: z.string().optional(),
  observacoes:  z.string().optional(),
  inspetor:     z.string().optional(),
});

router.put("/:id", async (req: Request, res: Response) => {
  const parsed = EditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "Dados inválidos.", detalhes: parsed.error.flatten().fieldErrors });
  }
  const updates: Record<string, unknown> = { ...parsed.data };
  const { data: atual } = await supabaseAdmin
    .from("hidrantes").select("status_inspecao").eq("id", req.params.id).maybeSingle();
  // A manual edit of a checklist item means the hydrant now has data.
  const editouChecklist = ITEM_KEYS.some((k) => k in parsed.data);
  if (editouChecklist && (atual as any)?.status_inspecao === "nao_inspecionado") {
    updates.status_inspecao = "aguardando_verificacao";
    updates.inspecionado_em = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from("hidrantes").update(updates).eq("id", req.params.id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(404).json({ erro: "Hidrante não encontrado." });
  log.info({ id: req.params.id, by: req.admin?.email }, "hidrante editado manualmente");
  return res.json({ ...(data as any), situacao: calcularSituacaoHidrante(data as any) });
});

// ── POST /hidrantes/:id/verificar ────────────────────────────────────────────
const VerificarSchema = z.object({ verificado: z.boolean().default(true) });

router.post("/:id/verificar", async (req: Request, res: Response) => {
  const parsed = VerificarSchema.safeParse(req.body ?? {});
  const verificar = parsed.success ? parsed.data.verificado : true;
  const updates = verificar
    ? { status_inspecao: "verificado", verificado_por: req.admin?.id ?? null, verificado_em: new Date().toISOString() }
    : { status_inspecao: "aguardando_verificacao", verificado_por: null, verificado_em: null };

  const { data, error } = await supabaseAdmin
    .from("hidrantes").update(updates).eq("id", req.params.id)
    .neq("status_inspecao", "nao_inspecionado").select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  if (!data) return res.status(409).json({ erro: "Hidrante não inspecionado ainda — não pode ser verificado." });
  log.info({ id: req.params.id, verificar, by: req.admin?.email }, "verificação de hidrante alterada");
  return res.json({ ...(data as any), situacao: calcularSituacaoHidrante(data as any) });
});

// ── POST /hidrantes/:id/fotos ────────────────────────────────────────────────
const FotosUploadSchema = z.object({ fotos: z.array(z.string().min(1)).min(1).max(10) });

router.post("/:id/fotos", async (req: Request, res: Response) => {
  const parsed = FotosUploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Envie de 1 a 10 imagens em base64." });
  const id = String(req.params.id);

  const { data: atual } = await supabaseAdmin
    .from("hidrantes").select("id, fotos, status_inspecao").eq("id", id).maybeSingle();
  if (!atual) return res.status(404).json({ erro: "Hidrante não encontrado." });

  const novasUrls: string[] = [];
  let i = 0;
  for (const b64 of parsed.data.fotos) {
    const url = await uploadFotoBase64(`hidrantes/${id}`, b64, `${Date.now()}_${i++}`);
    if (url) novasUrls.push(url);
  }
  if (novasUrls.length === 0) return res.status(502).json({ erro: "Falha ao enviar as imagens." });

  const fotos = [...(((atual as any).fotos as string[]) ?? []), ...novasUrls];
  const updates: Record<string, unknown> = { fotos };
  if ((atual as any).status_inspecao === "nao_inspecionado") {
    updates.status_inspecao = "aguardando_verificacao";
    updates.inspecionado_em = new Date().toISOString();
  }
  const { data, error } = await supabaseAdmin
    .from("hidrantes").update(updates).eq("id", id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ id, adicionadas: novasUrls.length, by: req.admin?.email }, "fotos adicionadas ao hidrante");
  return res.json({ ...(data as any), situacao: calcularSituacaoHidrante(data as any) });
});

// ── DELETE /hidrantes/:id/fotos ──────────────────────────────────────────────
const FotoRemoveSchema = z.object({ url: z.string().min(1) });

router.delete("/:id/fotos", async (req: Request, res: Response) => {
  const parsed = FotoRemoveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "Informe a 'url' da foto a remover." });
  const id = String(req.params.id);
  const { data: atual } = await supabaseAdmin
    .from("hidrantes").select("id, fotos").eq("id", id).maybeSingle();
  if (!atual) return res.status(404).json({ erro: "Hidrante não encontrado." });
  const fotos = (((atual as any).fotos as string[]) ?? []).filter((u) => u !== parsed.data.url);
  const { data, error } = await supabaseAdmin
    .from("hidrantes").update({ fotos }).eq("id", id).select().maybeSingle();
  if (error) return res.status(400).json({ erro: error.message });
  log.info({ id, by: req.admin?.email }, "foto removida do hidrante");
  return res.json({ ...(data as any), situacao: calcularSituacaoHidrante(data as any) });
});

// ── POST /hidrantes/novo-mes (OWNER) ─────────────────────────────────────────
const NovoMesSchema = z.object({ mes_referencia: z.string().min(1) });

router.post("/novo-mes", async (req: Request, res: Response) => {
  if (req.admin?.role !== "owner") {
    return res.status(403).json({ erro: "Apenas o proprietário pode iniciar um novo mês." });
  }
  const parsed = NovoMesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: "mes_referencia é obrigatório (ex: Julho/2026)." });
  const { data, error } = await supabaseAdmin.rpc("iniciar_novo_ciclo_hidrante", {
    p_mes: parsed.data.mes_referencia, p_by: req.admin.id,
  });
  if (error) return res.status(500).json({ erro: error.message });
  log.info({ ciclo: data, mes: parsed.data.mes_referencia, by: req.admin.email }, "novo ciclo de hidrantes iniciado");
  return res.json({ ciclo_id: data, mes_referencia: parsed.data.mes_referencia });
});

// ── POST /hidrantes/seed (OWNER) ─────────────────────────────────────────────
router.post("/seed", async (req: Request, res: Response) => {
  if (req.admin?.role !== "owner") {
    return res.status(403).json({ erro: "Apenas o proprietário pode semear o inventário." });
  }
  const { data, error } = await supabaseAdmin.rpc("seed_hidrantes");
  if (error) return res.status(500).json({ erro: error.message });
  limparCacheUnidadesHidrante();
  log.info({ inseridos: data, by: req.admin.email }, "seed de hidrantes executado");
  return res.json({ inseridos: data });
});

export default router;
