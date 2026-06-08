import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import type { AdminRecord } from "./types";

// How Supabase Auth session verification works:
// 1. The client (browser/dashboard) logs in via Supabase Auth → receives a JWT access token.
// 2. Every subsequent request sends that token as:  Authorization: Bearer <jwt>
// 3. This middleware calls supabaseAdmin.auth.getUser(token).
//    Supabase verifies the JWT signature using its own secret — no extra round-trip needed
//    for the happy path; the library validates locally and only calls the server when needed.
// 4. On success we get the auth user's id. We then look up our own `admins` table by that id
//    to get the role, nome, and ativo flag.
// 5. The resulting AdminRecord is attached to req.admin for downstream handlers.

const log = logger.child({ modulo: "auth" });

// ── Helper: extract Bearer token from Authorization header ────────────────────
function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ── requireAuth ───────────────────────────────────────────────────────────────
// Validates the Supabase JWT and ensures the caller has an active admin record.
// Attaches req.admin on success. Returns 401 otherwise.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ erro: "Token de autenticação ausente." });
    return;
  }

  // Verify the JWT with Supabase
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    log.warn({ err: authError?.message }, "token inválido ou expirado");
    res.status(401).json({ erro: "Sessão inválida ou expirada. Faça login novamente." });
    return;
  }

  // Look up the admin record by the auth user's id
  const { data: admin, error: dbError } = await supabaseAdmin
    .from("admins")
    .select("id, email, nome, role, ativo, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (dbError) {
    log.error({ err: dbError.message, userId: user.id }, "erro ao buscar admin");
    res.status(500).json({ erro: "Erro interno ao verificar permissões." });
    return;
  }

  if (!admin) {
    log.warn({ userId: user.id }, "usuário autenticado mas sem registro em admins");
    res.status(401).json({ erro: "Usuário não tem acesso ao painel." });
    return;
  }

  if (!admin.ativo) {
    log.warn({ userId: user.id }, "admin inativo tentou acessar rota protegida");
    res.status(403).json({ erro: "Conta desativada. Entre em contato com o administrador." });
    return;
  }

  req.admin = admin as AdminRecord;
  next();
}

// ── requireAdmin ──────────────────────────────────────────────────────────────
// Allows owner OR active member. Must be chained after requireAuth.
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // requireAuth already ran and attached req.admin
  if (!req.admin) {
    res.status(401).json({ erro: "Não autenticado." });
    return;
  }
  // ativo already checked in requireAuth — just confirm role is valid
  if (req.admin.role !== "owner" && req.admin.role !== "member") {
    res.status(403).json({ erro: "Acesso negado." });
    return;
  }
  next();
}

// ── requireOwner ──────────────────────────────────────────────────────────────
// Allows owner ONLY. Must be chained after requireAuth.
export async function requireOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.admin) {
    res.status(401).json({ erro: "Não autenticado." });
    return;
  }
  if (req.admin.role !== "owner") {
    log.warn({ userId: req.admin.id, role: req.admin.role }, "acesso owner negado a member");
    res.status(403).json({ erro: "Apenas o proprietário pode realizar esta ação." });
    return;
  }
  next();
}
