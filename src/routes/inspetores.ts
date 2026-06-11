// Guards applied at mount point in index.ts:
//   GET    /inspetores        → requireAuth + requireAdmin (owner or member)
//   POST   /inspetores        → requireAuth + requireAdmin
//   PUT    /inspetores/:id    → requireAuth + requireAdmin
//   DELETE /inspetores/:id    → requireAuth + requireAdmin (soft-delete only)
//
// Soft-delete rationale: inspection records reference the inspector's phone.
// Hard-deleting an inspector would orphan history and make audit trails
// impossible. Setting ativo=false removes them from the webhook allowlist
// while keeping every past inspection attributable to a real person.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { normalizar } from "../inspetores/normalizar";

const router = Router();
const log = logger.child({ rota: "/inspetores" });

// ── Shared validation schema ──────────────────────────────────────────────────

const InspetorBodySchema = z.object({
  nome:     z.string().min(2, "Nome deve ter pelo menos 2 caracteres."),
  telefone: z.string().min(1, "Telefone é obrigatório."),
  // Fixed unit this inspector covers. Every photo they send is auto-tagged with
  // this unit, so they never need to type a "unidade:" command in WhatsApp.
  unidade:  z.string().min(1, "Unidade é obrigatória."),
  ativo:    z.boolean().optional(),
});

// ── GET /inspetores ───────────────────────────────────────────────────────────
// Lists all inspectors ordered by name. Returns both active and inactive so
// the UI can show a full roster with status.
router.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("inspetores")
    .select("id, nome, telefone, telefone_normalizado, unidade_contexto, ativo, created_at, updated_at")
    .order("nome");

  if (error) {
    log.error({ err: error.message }, "erro ao listar inspetores");
    return res.status(500).json({ erro: "Erro ao buscar inspetores." });
  }

  // Expose unidade_contexto to the client under the friendlier name "unidade".
  const inspetores = (data ?? []).map(({ unidade_contexto, ...rest }: any) => ({
    ...rest,
    unidade: unidade_contexto ?? "",
  }));

  return res.json({ inspetores });
});

// ── POST /inspetores ──────────────────────────────────────────────────────────
// Creates a new inspector. Validates and normalizes the phone number.
// Rejects if an active inspector already holds the same normalized number.
router.post("/", async (req: Request, res: Response) => {
  const parsed = InspetorBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const { nome, telefone, unidade } = parsed.data;

  let telefoneNormalizado: string;
  try {
    telefoneNormalizado = normalizar(telefone);
  } catch (err: any) {
    return res.status(422).json({ erro: err.message });
  }

  // Check for duplicate active number before inserting
  const { data: existente } = await supabaseAdmin
    .from("inspetores")
    .select("id, nome")
    .eq("telefone_normalizado", telefoneNormalizado)
    .eq("ativo", true)
    .maybeSingle();

  if (existente) {
    return res.status(409).json({
      erro: `Já existe um inspetor ativo com este número: ${existente.nome}. Desative-o antes de reutilizar o número.`,
    });
  }

  const { data, error } = await supabaseAdmin
    .from("inspetores")
    .insert({
      nome,
      telefone,
      telefone_normalizado: telefoneNormalizado,
      unidade_contexto: unidade,
      ativo: true,
    })
    .select("id, nome, telefone, telefone_normalizado, unidade_contexto, ativo, created_at, updated_at")
    .single();

  if (error) {
    log.error({ err: error.message, telefoneNormalizado }, "erro ao criar inspetor");
    return res.status(500).json({ erro: "Erro ao cadastrar inspetor." });
  }

  log.info({ id: data.id, nome: data.nome, unidade }, "inspetor criado");
  const { unidade_contexto, ...rest } = data as any;
  return res.status(201).json({ ...rest, unidade: unidade_contexto ?? "" });
});

// ── PUT /inspetores/:id ───────────────────────────────────────────────────────
// Updates nome, telefone, and/or ativo. Re-normalizes the number if changed.
// Rejects if the new normalized number conflicts with another active inspector.
router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const parsed = InspetorBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const updates = parsed.data;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ erro: "Nenhum campo fornecido para atualização." });
  }

  // Fetch the current row so we can validate without blind-updating
  const { data: atual, error: fetchErr } = await supabaseAdmin
    .from("inspetores")
    .select("id, nome, telefone_normalizado, ativo")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    log.error({ err: fetchErr.message, id }, "erro ao buscar inspetor para edição");
    return res.status(500).json({ erro: "Erro ao buscar inspetor." });
  }
  if (!atual) {
    return res.status(404).json({ erro: "Inspetor não encontrado." });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.nome !== undefined)    patch.nome = updates.nome;
  if (updates.ativo !== undefined)   patch.ativo = updates.ativo;
  if (updates.unidade !== undefined) patch.unidade_contexto = updates.unidade;

  if (updates.telefone !== undefined) {
    let novoNormalizado: string;
    try {
      novoNormalizado = normalizar(updates.telefone);
    } catch (err: any) {
      return res.status(422).json({ erro: err.message });
    }

    // Check conflict only if the normalized number is actually changing
    if (novoNormalizado !== atual.telefone_normalizado) {
      const novoAtivo = updates.ativo !== undefined ? updates.ativo : atual.ativo;
      if (novoAtivo) {
        const { data: conflito } = await supabaseAdmin
          .from("inspetores")
          .select("id, nome")
          .eq("telefone_normalizado", novoNormalizado)
          .eq("ativo", true)
          .neq("id", id)
          .maybeSingle();

        if (conflito) {
          return res.status(409).json({
            erro: `Já existe um inspetor ativo com este número: ${conflito.nome}.`,
          });
        }
      }
      patch.telefone = updates.telefone;
      patch.telefone_normalizado = novoNormalizado;
    } else {
      patch.telefone = updates.telefone;
    }
  }

  const { data, error } = await supabaseAdmin
    .from("inspetores")
    .update(patch)
    .eq("id", id)
    .select("id, nome, telefone, telefone_normalizado, unidade_contexto, ativo, created_at, updated_at")
    .single();

  if (error) {
    log.error({ err: error.message, id }, "erro ao atualizar inspetor");
    return res.status(500).json({ erro: "Erro ao atualizar inspetor." });
  }

  log.info({ id, patch: Object.keys(patch) }, "inspetor atualizado");
  const { unidade_contexto, ...rest } = data as any;
  return res.json({ ...rest, unidade: unidade_contexto ?? "" });
});

// ── DELETE /inspetores/:id ────────────────────────────────────────────────────
// Soft-deletes by setting ativo=false. Does NOT remove the row.
// This preserves the inspector's identity in historical inspection records.
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: atual } = await supabaseAdmin
    .from("inspetores")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!atual) {
    return res.status(404).json({ erro: "Inspetor não encontrado." });
  }

  const { error } = await supabaseAdmin
    .from("inspetores")
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    log.error({ err: error.message, id }, "erro ao desativar inspetor");
    return res.status(500).json({ erro: "Erro ao desativar inspetor." });
  }

  log.info({ id }, "inspetor desativado (soft-delete)");
  return res.json({ mensagem: "Inspetor desativado com sucesso." });
});

export default router;
