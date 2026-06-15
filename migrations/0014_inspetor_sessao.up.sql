-- =============================================================================
-- MIGRATION 0014: inspector work session (token-saving gate)
--
-- A registered inspector (ativo=true) is ALLOWED to use the system, but their
-- photos are only analysed by the AI while a "work session" is open. This stops
-- OpenAI tokens being spent on unrelated photos sent outside working hours.
--
--   em_sessao = true   → photos are processed
--   em_sessao = false  → photos are ignored silently
--
-- The inspector opens a session via WhatsApp ("Iniciar") and closes it
-- ("Encerrar"). A long inactivity backstop also closes forgotten sessions.
-- sessao_atividade_em tracks the last message time for that backstop.
-- =============================================================================

ALTER TABLE inspetores
  ADD COLUMN IF NOT EXISTS em_sessao           BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sessao_iniciada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sessao_atividade_em TIMESTAMPTZ;
