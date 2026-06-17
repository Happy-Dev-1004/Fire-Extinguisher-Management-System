import "dotenv/config";
import express from "express";
import cors from "cors";
import extintoresRouter    from "./routes/extintores";
import inspecoesRouter     from "./routes/inspecoes";
import webhookRouter, { varrerLotesAbandonados } from "./routes/webhook";
import fichaRouter         from "./routes/ficha";
import setupRouter         from "./routes/setup";
import meRouter            from "./routes/me";
import equipeRouter        from "./routes/equipe";
import configuracoesRouter  from "./routes/configuracoes";
import inspetoresRouter     from "./routes/inspetores";
import destinatariosRouter  from "./routes/destinatarios";
import buscaRouter          from "./routes/busca";
import relatorioRouter      from "./routes/relatorio";
import manutencaoRouter      from "./routes/manutencao";
import regioesRouter         from "./routes/regioes";
import { requireAuth, requireAdmin, requireOwner } from "./auth/middleware";
import { logger } from "./logger";
import { supabaseAdmin } from "./db-admin";

// Import types augmentation so req.admin is available everywhere
import "./auth/types";

const app  = express();
const PORT = process.env.PORT ?? 3000;

// ── Startup secrets audit ─────────────────────────────────────────────────────
// Checks each required secret: DB row takes priority over .env fallback.
// Prints only "presente" / "ausente" — NEVER prints the actual value.
async function auditarSegredos(): Promise<void> {
  const SEGREDOS = [
    "OPENAI_API_KEY",
    "ZAPI_INSTANCE_ID",
    "ZAPI_TOKEN",
    "ZAPI_CLIENT_TOKEN",
    "WHATSAPP_NUMERO",
  ] as const;

  const ENV_FALLBACK: Record<string, string> = {
    OPENAI_API_KEY:   "OPENAI_API_KEY",
    ZAPI_INSTANCE_ID: "ZAPI_INSTANCE_ID",
    ZAPI_TOKEN:       "ZAPI_TOKEN",
    ZAPI_CLIENT_TOKEN:"ZAPI_CLIENT_TOKEN",
    WHATSAPP_NUMERO:  "WHATSAPP_NUMERO",
  };

  const { data: rows } = await supabaseAdmin
    .from("configuracoes")
    .select("nome, ciphertext")
    .in("nome", [...SEGREDOS]);

  const noDb = new Set((rows ?? []).filter((r: any) => r.ciphertext).map((r: any) => r.nome));

  const log = logger.child({ etapa: "startup" });
  log.info("=== Auditoria de segredos ===");

  let todasPresentes = true;
  for (const nome of SEGREDOS) {
    const noEnv = !!process.env[ENV_FALLBACK[nome]]?.trim();
    const fonte = noDb.has(nome) ? "banco (criptografado)" : noEnv ? ".env (fallback)" : null;
    const status = fonte ? `presente [${fonte}]` : "AUSENTE ⚠";
    if (!fonte) todasPresentes = false;
    log.info({ segredo: nome, status }, `segredo: ${nome} → ${status}`);
  }

  if (todasPresentes) {
    log.info("Todos os segredos presentes — sistema pronto para operação.");
  } else {
    log.warn("Um ou mais segredos ausentes — algumas funções podem falhar. Configure via /configuracoes.");
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// The frontend (Vercel) and backend (Railway) are on different origins in
// production, so cross-origin requests must be allowed. CORS_ORIGINS is a
// comma-separated allowlist (e.g. "https://app.vercel.app,https://www.foo.com").
// When unset (local dev), all origins are allowed since the Vite proxy keeps
// requests same-origin anyway.
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  })
);

// 25mb: webhook payloads are small, but manual photo uploads send base64 images
// (several at once). The frontend downscales before upload, but allow headroom.
app.use(express.json({ limit: "25mb" }));

// ── Public routes (no auth) ───────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Reports the git commit currently running. Railway injects RAILWAY_GIT_COMMIT_SHA
// at build time; this lets us confirm at a glance whether the latest push actually
// deployed (vs. a stale build) — invaluable for diagnosing deploy lag.
app.get("/version", (_req, res) =>
  res.json({
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "unknown",
    branch: process.env.RAILWAY_GIT_BRANCH ?? "unknown",
    deployed_at: process.env.RAILWAY_DEPLOYMENT_ID ?? "unknown",
  })
);

// One-time owner bootstrap — public but self-closes after first owner is created.
app.use("/setup", setupRouter);

// Z-API webhook — authenticated by phone allowlist inside the handler, not by session.
app.use("/webhook", webhookRouter);

// ── Authenticated routes ──────────────────────────────────────────────────────
// requireAuth validates the Bearer JWT and attaches req.admin on every request.
// requireAdmin / requireOwner then enforce role — declared per-router so the
// required role is visible at the mount point.

// Dashboard data: owner + member
app.use("/me",         requireAuth,                    meRouter);
app.use("/extintores", requireAuth, requireAdmin,      extintoresRouter);
app.use("/inspecoes",  requireAuth, requireAdmin,      inspecoesRouter);

// PDF generation: owner + member (they're viewing inspection data)
app.use("/ficha",      requireAuth, requireAdmin,      fichaRouter);

// Team management: owner only — except /equipe/convites/aceitar which is public
// (the public sub-route is declared first inside the router before requireOwner applies)
app.use("/equipe/convites/aceitar", equipeRouter); // public: token is the credential
app.use("/equipe",          requireAuth, requireOwner, equipeRouter);

// Secrets management: owner only — members are rejected 403 by requireOwner
app.use("/configuracoes",   requireAuth, requireOwner, configuracoesRouter);

// Inspector management: owner + member (field roster is not sensitive config)
app.use("/inspetores",      requireAuth, requireAdmin, inspetoresRouter);

// Recipient management: owner + member (operational data, not sensitive config)
app.use("/destinatarios",   requireAuth, requireAdmin, destinatariosRouter);

// Search + reports: owner + member (read-only inspection data)
app.use("/busca",           requireAuth, requireAdmin, buscaRouter);
app.use("/relatorio",       requireAuth, requireAdmin, relatorioRouter);

// Maintenance: owner only — on-demand batch sweep, etc.
app.use("/manutencao",      requireAuth, requireOwner, manutencaoRouter);

// Regional inventory: owner + member (view, edit, verify). Owner-only actions
// (novo-mes, seed) are guarded inside the router by role checks.
app.use("/regioes",         requireAuth, requireAdmin, regioesRouter);

// Bind to 0.0.0.0 so the platform's proxy (Railway/Render) can reach the
// container — binding to localhost/IPv6-only causes a 502 at the edge.
app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info({ porta: PORT }, `Servidor iniciado na porta ${PORT}`);
  // Run audit after the server is up so DB connection is ready
  auditarSegredos().catch((err) =>
    logger.warn({ err: err.message }, "falha na auditoria de segredos na inicialização")
  );

  // Recover any batch left 'aberto' by a previous restart, then keep sweeping.
  // The in-memory auto-close timer doesn't survive redeploys; this guarantees
  // orphaned photo batches are always closed and analysed.
  varrerLotesAbandonados().catch((err) =>
    logger.warn({ err: err.message }, "falha na varredura inicial de lotes abandonados")
  );
  setInterval(() => {
    varrerLotesAbandonados().catch((err) =>
      logger.warn({ err: err.message }, "falha na varredura periódica de lotes abandonados")
    );
  }, 30_000);
});
