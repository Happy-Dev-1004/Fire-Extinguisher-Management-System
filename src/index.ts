import "dotenv/config";
import express from "express";
import extintoresRouter    from "./routes/extintores";
import inspecoesRouter     from "./routes/inspecoes";
import webhookRouter       from "./routes/webhook";
import fichaRouter         from "./routes/ficha";
import setupRouter         from "./routes/setup";
import meRouter            from "./routes/me";
import equipeRouter        from "./routes/equipe";
import configuracoesRouter from "./routes/configuracoes";
import inspetoresRouter    from "./routes/inspetores";
import { requireAuth, requireAdmin, requireOwner } from "./auth/middleware";

// Import types augmentation so req.admin is available everywhere
import "./auth/types";

const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

// ── Public routes (no auth) ───────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

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

app.listen(PORT, () => {
  console.log(`Server starting... listening on port ${PORT}`);
});
