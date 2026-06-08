import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";

// One-time owner bootstrap route.
//
// Security model:
// - Only runs when NO owner row exists in `admins` yet.
// - Requires a SETUP_TOKEN from .env, compared with timingSafeEqual to
//   prevent timing-attack token enumeration.
// - Creates the Supabase Auth user (or finds an existing one) then inserts
//   the `admins` row with role='owner'.
// - After an owner exists, every subsequent call returns 409 immediately —
//   the route permanently closes itself.
//
// Never returns whether the email exists in auth — just success or a generic error.

const router = Router();
const log = logger.child({ rota: "/setup" });

const BodySchema = z.object({
  setup_token: z.string().min(1),
  nome:        z.string().min(1),
  password:    z.string().min(8, "A senha deve ter no mínimo 8 caracteres."),
});

function getSetupConfig(): { ownerEmail: string; setupToken: string } {
  const ownerEmail  = process.env.OWNER_EMAIL?.trim();
  const setupToken  = process.env.SETUP_TOKEN?.trim();
  if (!ownerEmail || !setupToken) {
    throw new Error("OWNER_EMAIL e SETUP_TOKEN devem estar definidos no .env");
  }
  return { ownerEmail, setupToken };
}

// Constant-time string comparison — both inputs converted to same-length buffers.
function tokenMatch(candidate: string, secret: string): boolean {
  // Pad or truncate both to the same length to avoid length-leak.
  // Use the secret's length as the canonical length.
  const secretBuf    = Buffer.from(secret,    "utf8");
  const candidateBuf = Buffer.alloc(secretBuf.length, 0);
  Buffer.from(candidate, "utf8").copy(candidateBuf, 0, 0, secretBuf.length);
  return timingSafeEqual(candidateBuf, secretBuf);
}

// POST /setup
// Body: { setup_token, nome, password }
// Creates the first owner. Idempotent if the owner auth user already exists
// but the admins row does not (e.g. a previous partial run).
router.post("/", async (req: Request, res: Response) => {
  // ── 1. Parse env config ────────────────────────────────────────────────────
  let config: ReturnType<typeof getSetupConfig>;
  try {
    config = getSetupConfig();
  } catch (err: any) {
    log.error({ err: err.message }, "configuração de setup ausente");
    return res.status(500).json({ erro: "Configuração de setup incompleta no servidor." });
  }

  // ── 2. Validate request body ───────────────────────────────────────────────
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const { setup_token, nome, password } = parsed.data;

  // ── 3. Verify setup token (timing-safe) ────────────────────────────────────
  if (!tokenMatch(setup_token, config.setupToken)) {
    log.warn("tentativa de setup com token incorreto");
    return res.status(401).json({ erro: "Token de setup inválido." });
  }

  // ── 4. Guard: refuse if owner already exists ──────────────────────────────
  const { data: existingOwner, error: checkError } = await supabaseAdmin
    .from("admins")
    .select("id")
    .eq("role", "owner")
    .maybeSingle();

  if (checkError) {
    log.error({ err: checkError.message }, "erro ao verificar owner existente");
    return res.status(500).json({ erro: "Erro interno ao verificar cadastro." });
  }

  if (existingOwner) {
    log.warn("setup recusado — owner já existe");
    return res.status(409).json({ erro: "O proprietário já foi configurado. Esta rota está fechada." });
  }

  // ── 5. Create (or find) the Supabase Auth user ────────────────────────────
  const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email:             config.ownerEmail,
    password,
    email_confirm:     true,   // skip confirmation email — owner is trusted by token
  });

  let authUserId: string;

  if (createError) {
    // If the user already exists in auth (e.g. from a previous partial run),
    // look them up by email instead of failing.
    if (createError.message.toLowerCase().includes("already registered")) {
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
        log.error({ err: listError.message }, "erro ao buscar usuário existente no auth");
        return res.status(500).json({ erro: "Erro interno ao configurar autenticação." });
      }
      const existing = listData.users.find((u) => u.email === config.ownerEmail);
      if (!existing) {
        log.error("usuário reportado como existente mas não encontrado na listagem");
        return res.status(500).json({ erro: "Erro interno ao configurar autenticação." });
      }
      authUserId = existing.id;
    } else {
      log.error({ err: createError.message }, "erro ao criar usuário no Supabase Auth");
      return res.status(500).json({ erro: "Erro ao criar conta de acesso." });
    }
  } else {
    authUserId = createData.user.id;
  }

  // ── 6. Insert the admins row ───────────────────────────────────────────────
  const { error: insertError } = await supabaseAdmin
    .from("admins")
    .insert({
      id:    authUserId,
      email: config.ownerEmail,
      nome,
      role:  "owner",
      ativo: true,
    });

  if (insertError) {
    log.error({ err: insertError.message }, "erro ao inserir admin owner");
    return res.status(500).json({ erro: "Erro ao registrar administrador." });
  }

  log.info({ email: config.ownerEmail }, "owner criado com sucesso via setup");
  return res.status(201).json({
    mensagem: "Proprietário configurado com sucesso. Esta rota está agora desativada.",
    email: config.ownerEmail,
    role:  "owner",
  });
});

export default router;
