-- =============================================================================
-- MIGRATION 0026: per-phase permissions for inspectors
--
-- Phase 1 (extintores) and Phase 2 (alarme) share the same inspetores roster and
-- the same WhatsApp webhook. Without a phase tag, a Phase 2 supervisor's photo
-- could fall through to Phase 1's OpenAI analysis (wasted tokens + wrong data).
--
-- This adds explicit per-phase permission flags so the webhook can authorize each
-- phase independently, and a SEPARATE Phase 2 session so starting/ending Phase 1
-- work never leaks into Phase 2 (each phase is started/ended by its own command).
--
-- Back-compat: every existing inspector keeps Phase 1 access (pode_fase1=true);
-- Phase 2 is opt-in (pode_fase2=false) so nobody is silently granted alarm access.
-- =============================================================================

ALTER TABLE inspetores
  ADD COLUMN IF NOT EXISTS pode_fase1 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pode_fase2 BOOLEAN NOT NULL DEFAULT false;

-- Phase 2 work-session (independent of the Phase 1 em_sessao columns). A Phase 2
-- supervisor must explicitly start ("alarme") and end ("encerrar alarme") their
-- session; outside it, photos are ignored — no token cost.
ALTER TABLE inspetores
  ADD COLUMN IF NOT EXISTS em_sessao_fase2          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sessao_fase2_iniciada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sessao_fase2_atividade_em TIMESTAMPTZ;

-- Existing rows already get the defaults via the NOT NULL DEFAULT above; this is
-- a no-op safety net in case the columns pre-existed nullable.
UPDATE inspetores SET pode_fase1 = COALESCE(pode_fase1, true);
UPDATE inspetores SET pode_fase2 = COALESCE(pode_fase2, false);
