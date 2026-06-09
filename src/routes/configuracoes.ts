// Guards applied at mount point in index.ts:
//   GET  /configuracoes        → requireAuth + requireOwner
//   PUT  /configuracoes/:nome  → requireAuth + requireOwner
// A member hitting either endpoint is rejected 403 by requireOwner before
// this router executes — no secret ever reaches a non-owner request.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { encrypt, mascarar } from "../segredos/cripto";

const router = Router();
const log = logger.child({ rota: "/configuracoes" });

// The canonical set of secret names the system manages.
// Only these names are accepted for reads and writes.
export const NOMES_SEGREDOS = [
  "OPENAI_API_KEY",
  "ZAPI_INSTANCE_ID",
  "ZAPI_TOKEN",
  "ZAPI_CLIENT_TOKEN",
  "WHATSAPP_NUMERO",
] as const;

export type NomeSegredo = (typeof NOMES_SEGREDOS)[number];

// Per-secret format validators run at PUT time, before encryption.
// These validate the shape of the plaintext value before we store it.
const VALIDADORES: Partial<Record<NomeSegredo, (v: string) => string | null>> = {
  OPENAI_API_KEY: (v) =>
    v.startsWith("sk-") ? null : "A chave OpenAI deve começar com 'sk-'.",
  ZAPI_INSTANCE_ID: (v) =>
    v.length >= 8 ? null : "ZAPI_INSTANCE_ID muito curto.",
  ZAPI_TOKEN: (v) =>
    v.length >= 8 ? null : "ZAPI_TOKEN muito curto.",
  ZAPI_CLIENT_TOKEN: (v) =>
    v.length >= 8 ? null : "ZAPI_CLIENT_TOKEN muito curto.",
  WHATSAPP_NUMERO: (v) =>
    /^\d{10,15}$/.test(v) ? null : "Número WhatsApp deve conter apenas dígitos (10-15 caracteres).",
};

// ── GET /configuracoes ────────────────────────────────────────────────────────
// Returns all secrets MASKED — never plaintext. The owner sees which secrets
// are configured and their masked values, but not the actual values.
router.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabaseAdmin
    .from("configuracoes")
    .select("nome, valor_mascarado, updated_at, updated_by")
    .order("nome");

  if (error) {
    log.error({ err: error.message }, "erro ao listar configurações");
    return res.status(500).json({ erro: "Erro ao buscar configurações." });
  }

  // For secrets not yet in the DB, include them as unconfigured
  const configuradas = new Set((data ?? []).map((r: any) => r.nome));
  const resultado = NOMES_SEGREDOS.map((nome) => {
    const row = (data ?? []).find((r: any) => r.nome === nome);
    return row
      ? { nome, configurado: true,  valor_mascarado: row.valor_mascarado, updated_at: row.updated_at, updated_by: row.updated_by }
      : { nome, configurado: false, valor_mascarado: null, updated_at: null, updated_by: null };
  });

  return res.json({ configuracoes: resultado });
});

// ── PUT /configuracoes/:nome ──────────────────────────────────────────────────
// Validates, encrypts, and stores (or replaces) a secret.
// The plaintext is used only in-process to encrypt; it's never logged or returned.
const PutBodySchema = z.object({
  valor: z.string().min(1, "O valor não pode ser vazio."),
});

router.put("/:nome", async (req: Request, res: Response) => {
  const { nome } = req.params;
  const owner = req.admin!;

  // Reject unknown secret names
  if (!NOMES_SEGREDOS.includes(nome as NomeSegredo)) {
    return res.status(400).json({
      erro: `Nome de segredo inválido. Nomes aceitos: ${NOMES_SEGREDOS.join(", ")}.`,
    });
  }

  const parsed = PutBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const { valor } = parsed.data;

  // Format validation
  const validador = VALIDADORES[nome as NomeSegredo];
  if (validador) {
    const erroFormato = validador(valor);
    if (erroFormato) {
      return res.status(422).json({ erro: erroFormato });
    }
  }

  // Encrypt — throws if MASTER_ENCRYPTION_KEY is missing or malformed
  let cifra: ReturnType<typeof encrypt>;
  try {
    cifra = encrypt(valor);
  } catch (err: any) {
    log.error({ err: err.message, nome }, "falha ao criptografar segredo");
    return res.status(500).json({ erro: "Erro de configuração do servidor: chave de criptografia ausente." });
  }

  const mascarado = mascarar(valor);

  // Upsert: insert or replace
  const { error } = await supabaseAdmin
    .from("configuracoes")
    .upsert(
      {
        nome,
        ciphertext:      cifra.ciphertext,
        iv:              cifra.iv,
        auth_tag:        cifra.auth_tag,
        valor_mascarado: mascarado,
        updated_by:      owner.id,
      },
      { onConflict: "nome" }
    );

  if (error) {
    log.error({ err: error.message, nome }, "erro ao salvar segredo no banco");
    return res.status(500).json({ erro: "Erro ao salvar configuração." });
  }

  log.info({ nome, updatedBy: owner.id }, "segredo atualizado");
  return res.status(200).json({
    mensagem: `Segredo '${nome}' salvo com sucesso.`,
    valor_mascarado: mascarado,
  });
});

export default router;
