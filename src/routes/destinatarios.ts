// Guards applied at mount point in index.ts:
//   GET    /destinatarios            → requireAuth + requireAdmin
//   POST   /destinatarios            → requireAuth + requireAdmin
//   PUT    /destinatarios/:id        → requireAuth + requireAdmin
//   DELETE /destinatarios/:id        → requireAuth + requireAdmin (soft-delete)
//
// Both owner and member can manage recipients — consistent with inspector
// management and the principle that field-operational data isn't sensitive
// configuration (which is owner-only).

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { normalizar } from "../inspetores/normalizar";
import { TODAS_UNIDADES } from "../destinatarios/resolver";

const router = Router();
const log = logger.child({ rota: "/destinatarios" });

// ── Validation ────────────────────────────────────────────────────────────────

// A recipient may receive via WhatsApp (telefone), email, or BOTH.
// telefone and email are each optional, but at least one must be present —
// validated in the handlers since "at least one of" depends on the merge of
// body + existing row on PUT.
const DestinatarioBodySchema = z.object({
  nome:     z.string().min(2, "Nome deve ter pelo menos 2 caracteres."),
  telefone: z.string().trim().optional(),
  email:    z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  // unidade: a non-empty site name, or exactly "*" for all units
  unidade:  z.string().min(1, "Unidade é obrigatória."),
  ativo:    z.boolean().optional(),
});

// ── GET /destinatarios ────────────────────────────────────────────────────────
// Returns ALL recipients (active + inactive) so the UI can show the full
// roster. Optionally filter by ?unidade=X (including "?unidade=*").
router.get("/", async (req: Request, res: Response) => {
  let query = supabaseAdmin
    .from("destinatarios_ficha")
    .select("id, nome, telefone, telefone_normalizado, email, unidade, ativo, created_at, updated_at")
    .order("unidade")
    .order("nome");

  if (req.query.unidade) {
    query = query.eq("unidade", req.query.unidade as string);
  }

  const { data, error } = await query;

  if (error) {
    log.error({ err: error.message }, "erro ao listar destinatários");
    return res.status(500).json({ erro: "Erro ao buscar destinatários." });
  }

  return res.json({ destinatarios: data ?? [] });
});

// ── POST /destinatarios ───────────────────────────────────────────────────────
// Creates a new recipient. Normalizes the phone number.
// Rejects if an active recipient in the SAME scope already holds the number.
router.post("/", async (req: Request, res: Response) => {
  const parsed = DestinatarioBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const { nome, unidade, ativo = true } = parsed.data;
  const telefone = parsed.data.telefone?.trim() || "";
  const email    = parsed.data.email?.trim() || "";

  // At least one delivery channel is required.
  if (!telefone && !email) {
    return res.status(422).json({ erro: "Informe ao menos um canal: telefone (WhatsApp) ou e-mail." });
  }

  let telefoneNormalizado = "";
  if (telefone) {
    try {
      telefoneNormalizado = normalizar(telefone);
    } catch (err: any) {
      return res.status(422).json({ erro: err.message });
    }
  }

  const escopoLabel = unidade === TODAS_UNIDADES ? "todas as unidades" : `unidade "${unidade}"`;

  // Duplicate check within the same scope (only when a phone is provided).
  if (telefoneNormalizado) {
    const { data: existente } = await supabaseAdmin
      .from("destinatarios_ficha")
      .select("id, nome")
      .eq("telefone_normalizado", telefoneNormalizado)
      .eq("unidade", unidade)
      .eq("ativo", true)
      .maybeSingle();

    if (existente) {
      return res.status(409).json({
        erro: `Já existe um destinatário ativo com este número para ${escopoLabel}: ${existente.nome}. Desative-o antes de reutilizar o número neste escopo.`,
      });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("destinatarios_ficha")
    .insert({
      nome,
      telefone,
      telefone_normalizado: telefoneNormalizado,
      email: email || null,
      unidade,
      ativo,
    })
    .select("id, nome, telefone, telefone_normalizado, email, unidade, ativo, created_at, updated_at")
    .single();

  if (error) {
    log.error({ err: error.message, telefoneNormalizado, unidade }, "erro ao criar destinatário");
    return res.status(500).json({ erro: "Erro ao cadastrar destinatário." });
  }

  log.info({ id: data.id, nome: data.nome, unidade }, "destinatário criado");
  return res.status(201).json(data);
});

// ── PUT /destinatarios/:id ────────────────────────────────────────────────────
// Updates nome, telefone, unidade, and/or ativo.
// Re-validates uniqueness if phone or scope changes.
router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const parsed = DestinatarioBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const updates = parsed.data;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: "Nenhum campo fornecido para atualização." });
  }

  const { data: atual, error: fetchErr } = await supabaseAdmin
    .from("destinatarios_ficha")
    .select("id, nome, telefone, telefone_normalizado, email, unidade, ativo")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    log.error({ err: fetchErr.message, id }, "erro ao buscar destinatário para edição");
    return res.status(500).json({ erro: "Erro ao buscar destinatário." });
  }
  if (!atual) {
    return res.status(404).json({ erro: "Destinatário não encontrado." });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.nome    !== undefined) patch.nome    = updates.nome;
  if (updates.ativo   !== undefined) patch.ativo   = updates.ativo;
  if (updates.unidade !== undefined) patch.unidade = updates.unidade;

  const novoTelefone = updates.telefone !== undefined ? updates.telefone.trim() : undefined;
  const novoEmail    = updates.email    !== undefined ? updates.email.trim()    : undefined;
  const novaUnidade  = (updates.unidade  ?? atual.unidade)  as string;
  const novoAtivo    = (updates.ativo    ?? atual.ativo)     as boolean;

  if (novoTelefone !== undefined) {
    if (novoTelefone === "") {
      // Clearing the phone channel
      patch.telefone             = "";
      patch.telefone_normalizado = "";
    } else {
      let novoNormalizado: string;
      try {
        novoNormalizado = normalizar(novoTelefone);
      } catch (err: any) {
        return res.status(422).json({ erro: err.message });
      }

      const phoneChanged  = novoNormalizado !== atual.telefone_normalizado;
      const scopeChanged  = novaUnidade !== atual.unidade;

      if (novoAtivo && (phoneChanged || scopeChanged)) {
        const escopoLabel = novaUnidade === TODAS_UNIDADES ? "todas as unidades" : `unidade "${novaUnidade}"`;
        const { data: conflito } = await supabaseAdmin
          .from("destinatarios_ficha")
          .select("id, nome")
          .eq("telefone_normalizado", novoNormalizado)
          .eq("unidade", novaUnidade)
          .eq("ativo", true)
          .neq("id", id)
          .maybeSingle();

        if (conflito) {
          return res.status(409).json({
            erro: `Já existe um destinatário ativo com este número para ${escopoLabel}: ${conflito.nome}.`,
          });
        }
      }

      patch.telefone             = novoTelefone;
      patch.telefone_normalizado = novoNormalizado;
    }
  }

  if (novoEmail !== undefined) {
    patch.email = novoEmail || null;
  }

  // After applying the patch, at least one channel must remain.
  const telefoneFinal = (patch.telefone ?? atual.telefone ?? "") as string;
  const emailFinal    = (patch.email    ?? atual.email    ?? "") as string;
  if (!telefoneFinal && !emailFinal) {
    return res.status(422).json({ erro: "Informe ao menos um canal: telefone (WhatsApp) ou e-mail." });
  }

  const { data, error } = await supabaseAdmin
    .from("destinatarios_ficha")
    .update(patch)
    .eq("id", id)
    .select("id, nome, telefone, telefone_normalizado, email, unidade, ativo, created_at, updated_at")
    .single();

  if (error) {
    log.error({ err: error.message, id }, "erro ao atualizar destinatário");
    return res.status(500).json({ erro: "Erro ao atualizar destinatário." });
  }

  log.info({ id, campos: Object.keys(patch) }, "destinatário atualizado");
  return res.json(data);
});

// ── DELETE /destinatarios/:id ─────────────────────────────────────────────────
// Soft-delete: sets ativo=false.
// Hard-delete would lose the audit trail of who received past fichas.
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: atual } = await supabaseAdmin
    .from("destinatarios_ficha")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!atual) {
    return res.status(404).json({ erro: "Destinatário não encontrado." });
  }

  const { error } = await supabaseAdmin
    .from("destinatarios_ficha")
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    log.error({ err: error.message, id }, "erro ao desativar destinatário");
    return res.status(500).json({ erro: "Erro ao desativar destinatário." });
  }

  log.info({ id }, "destinatário desativado (soft-delete)");
  return res.json({ mensagem: "Destinatário desativado com sucesso." });
});

export default router;
