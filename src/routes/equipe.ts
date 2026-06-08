import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { requireAuth, requireOwner } from "../auth/middleware";

const router = Router();
const log = logger.child({ rota: "/equipe" });

// ── Helpers ───────────────────────────────────────────────────────────────────

function gerarToken(): string {
  // 32 random bytes → 64-char hex string. Cryptographically random, single-use.
  return randomBytes(32).toString("hex");
}

function dataExpiracao(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

// ── GET /equipe
// Lists all admins and all pending invites.
// Guard: requireAuth + requireOwner (applied at mount point in index.ts)
router.get("/", async (_req: Request, res: Response) => {
  const [adminsResult, convitesResult] = await Promise.all([
    supabaseAdmin
      .from("admins")
      .select("id, email, nome, role, ativo, created_at")
      .order("created_at"),
    supabaseAdmin
      .from("convites")
      .select("id, email, status, expira_em, created_at")
      .eq("status", "pendente")
      .order("created_at", { ascending: false }),
  ]);

  if (adminsResult.error) {
    log.error({ err: adminsResult.error.message }, "erro ao listar admins");
    return res.status(500).json({ erro: "Erro ao buscar lista de administradores." });
  }
  if (convitesResult.error) {
    log.error({ err: convitesResult.error.message }, "erro ao listar convites");
    return res.status(500).json({ erro: "Erro ao buscar convites pendentes." });
  }

  return res.json({
    admins:   adminsResult.data,
    convites: convitesResult.data,
  });
});

// ── POST /equipe/convites
// Creates a single-use invite for an email address.
// Guard: requireAuth + requireOwner (applied at mount point in index.ts)
const CriarConviteSchema = z.object({
  email: z.string().email("E-mail inválido."),
});

router.post("/convites", async (req: Request, res: Response) => {
  const parsed = CriarConviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const { email } = parsed.data;
  const owner = req.admin!;

  // Reject if the email already belongs to an active admin
  const { data: existente } = await supabaseAdmin
    .from("admins")
    .select("id, ativo")
    .eq("email", email)
    .maybeSingle();

  if (existente?.ativo) {
    return res.status(409).json({ erro: "Este e-mail já pertence a um administrador ativo." });
  }

  // Expire any existing pending invite for the same email before creating a new one
  await supabaseAdmin
    .from("convites")
    .update({ status: "expirado" })
    .eq("email", email)
    .eq("status", "pendente");

  const token     = gerarToken();
  const expira_em = dataExpiracao();

  const { data: convite, error } = await supabaseAdmin
    .from("convites")
    .insert({
      email,
      token,
      status:     "pendente",
      expira_em,
      criado_por: owner.id,
    })
    .select("id, email, expira_em")
    .single();

  if (error) {
    log.error({ err: error.message }, "erro ao criar convite");
    return res.status(500).json({ erro: "Erro ao criar convite." });
  }

  // Build the accept link — the frontend will serve this path
  const base = process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const link = `${base}/equipe/convites/aceitar?token=${token}`;

  // Log the link so it can be shared manually (no email service yet)
  log.info({ email, conviteId: convite.id, link, expira_em }, "convite criado");

  return res.status(201).json({
    mensagem: "Convite criado. Compartilhe o link abaixo com o convidado.",
    convite: { id: convite.id, email: convite.email, expira_em: convite.expira_em },
    link,
  });
});

// ── POST /equipe/convites/aceitar
// PUBLIC — no auth required. The invitee presents the token and sets a password.
// Guard: NONE (token itself is the credential; logged below)
const AceitarConviteSchema = z.object({
  token:  z.string().min(1, "Token ausente."),
  nome:   z.string().min(1, "Nome obrigatório."),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres."),
});

router.post("/convites/aceitar", async (req: Request, res: Response) => {
  const parsed = AceitarConviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const { token, nome, password } = parsed.data;

  // Look up the invite — select everything needed for validation in one query
  const { data: convite, error: fetchError } = await supabaseAdmin
    .from("convites")
    .select("id, email, status, expira_em")
    .eq("token", token)
    .maybeSingle();

  if (fetchError) {
    log.error({ err: fetchError.message }, "erro ao buscar convite");
    return res.status(500).json({ erro: "Erro interno ao verificar convite." });
  }

  if (!convite) {
    return res.status(404).json({ erro: "Convite não encontrado. Verifique o link e tente novamente." });
  }

  if (convite.status === "aceito") {
    return res.status(409).json({ erro: "Este convite já foi utilizado." });
  }
  if (convite.status === "revogado") {
    return res.status(410).json({ erro: "Este convite foi revogado pelo administrador." });
  }
  if (convite.status === "expirado" || new Date(convite.expira_em) < new Date()) {
    // Mark expired in DB if not already
    await supabaseAdmin.from("convites").update({ status: "expirado" }).eq("id", convite.id);
    return res.status(410).json({ erro: "Este convite expirou. Peça um novo convite ao proprietário." });
  }

  // Create the Supabase Auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email:         convite.email,
    password,
    email_confirm: true,
  });

  if (authError) {
    // If the auth user already exists (duplicate accept attempt), reject cleanly
    if (authError.message.toLowerCase().includes("already registered")) {
      return res.status(409).json({ erro: "Já existe uma conta com este e-mail." });
    }
    log.error({ err: authError.message }, "erro ao criar usuário no Auth");
    return res.status(500).json({ erro: "Erro ao criar conta de acesso." });
  }

  const authUserId = authData.user.id;

  // Insert the admins row
  const { error: adminError } = await supabaseAdmin
    .from("admins")
    .insert({
      id:    authUserId,
      email: convite.email,
      nome,
      role:  "member",
      ativo: true,
    });

  if (adminError) {
    // Roll back the auth user so we don't leave orphans
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    log.error({ err: adminError.message }, "erro ao inserir admin — auth user removido");
    return res.status(500).json({ erro: "Erro ao registrar administrador." });
  }

  // Mark invite as accepted — single-use enforced here
  const { error: updateError } = await supabaseAdmin
    .from("convites")
    .update({ status: "aceito" })
    .eq("id", convite.id);

  if (updateError) {
    // Non-fatal: the member was created successfully; just log the inconsistency
    log.error({ err: updateError.message, conviteId: convite.id }, "membro criado mas falha ao marcar convite como aceito");
  }

  log.info({ email: convite.email, authUserId }, "convite aceito — novo membro criado");
  return res.status(201).json({
    mensagem: "Conta criada com sucesso. Faça login para acessar o painel.",
    email:    convite.email,
    role:     "member",
  });
});

// ── DELETE /equipe/convites/:id
// Revokes a pending invite.
// Guard: requireAuth + requireOwner (applied at mount point in index.ts)
router.delete("/convites/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: convite } = await supabaseAdmin
    .from("convites")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (!convite) {
    return res.status(404).json({ erro: "Convite não encontrado." });
  }
  if (convite.status !== "pendente") {
    return res.status(409).json({ erro: `Convite não pode ser revogado — status atual: ${convite.status}.` });
  }

  const { error } = await supabaseAdmin
    .from("convites")
    .update({ status: "revogado" })
    .eq("id", id);

  if (error) {
    log.error({ err: error.message }, "erro ao revogar convite");
    return res.status(500).json({ erro: "Erro ao revogar convite." });
  }

  log.info({ conviteId: id }, "convite revogado");
  return res.status(200).json({ mensagem: "Convite revogado com sucesso." });
});

// ── DELETE /equipe/membros/:id
// Deactivates a member (sets ativo=false). Cannot deactivate the owner.
// Guard: requireAuth + requireOwner (applied at mount point in index.ts)
router.delete("/membros/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const owner = req.admin!;

  if (id === owner.id) {
    return res.status(400).json({ erro: "O proprietário não pode remover a própria conta." });
  }

  const { data: alvo } = await supabaseAdmin
    .from("admins")
    .select("id, role, ativo")
    .eq("id", id)
    .maybeSingle();

  if (!alvo) {
    return res.status(404).json({ erro: "Administrador não encontrado." });
  }
  if (alvo.role === "owner") {
    return res.status(400).json({ erro: "Não é possível remover o proprietário. Transfira a propriedade primeiro." });
  }
  if (!alvo.ativo) {
    return res.status(409).json({ erro: "Este membro já está desativado." });
  }

  const { error } = await supabaseAdmin
    .from("admins")
    .update({ ativo: false })
    .eq("id", id);

  if (error) {
    log.error({ err: error.message }, "erro ao desativar membro");
    return res.status(500).json({ erro: "Erro ao desativar membro." });
  }

  log.info({ adminId: id }, "membro desativado");
  return res.status(200).json({ mensagem: "Membro desativado com sucesso." });
});

// ── POST /equipe/transferir
// Atomically transfers ownership to an existing active member.
//
// Atomicity: this calls a Postgres stored function `transfer_ownership(novo_owner_id uuid)`
// via supabaseAdmin.rpc(). Inside that function, both UPDATEs run in the same transaction.
// Postgres either commits both or rolls back both — it is impossible for the DB to
// momentarily have zero owners or two owners, even under concurrent requests.
// A plain sequential REST approach (update A, then update B) cannot guarantee this.
//
// Guard: requireAuth + requireOwner (applied at mount point in index.ts)
const TransferirSchema = z.object({
  novo_owner_id: z.string().uuid("ID inválido."),
});

router.post("/transferir", async (req: Request, res: Response) => {
  const parsed = TransferirSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const { novo_owner_id } = parsed.data;
  const owner = req.admin!;

  if (novo_owner_id === owner.id) {
    return res.status(400).json({ erro: "Você já é o proprietário." });
  }

  // Verify the target is an active member (not already owner, not inactive)
  const { data: alvo } = await supabaseAdmin
    .from("admins")
    .select("id, role, ativo, email, nome")
    .eq("id", novo_owner_id)
    .maybeSingle();

  if (!alvo) {
    return res.status(404).json({ erro: "Membro não encontrado." });
  }
  if (!alvo.ativo) {
    return res.status(400).json({ erro: "Não é possível transferir para um membro desativado." });
  }
  if (alvo.role === "owner") {
    return res.status(409).json({ erro: "Este usuário já é proprietário." });
  }

  // Call the atomic Postgres RPC — see SQL in the instructions below
  const { error: rpcError } = await supabaseAdmin.rpc("transfer_ownership", {
    novo_owner_id,
    owner_atual_id: owner.id,
  });

  if (rpcError) {
    log.error({ err: rpcError.message }, "erro ao transferir propriedade");
    return res.status(500).json({ erro: "Erro ao transferir propriedade. Tente novamente." });
  }

  log.info({ antigoOwner: owner.id, novoOwner: novo_owner_id }, "propriedade transferida");
  return res.status(200).json({
    mensagem: `Propriedade transferida para ${alvo.nome} (${alvo.email}). Você agora é membro.`,
  });
});

export default router;
