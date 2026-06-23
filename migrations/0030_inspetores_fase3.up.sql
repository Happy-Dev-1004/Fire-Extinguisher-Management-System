-- =============================================================================
-- MIGRATION 0030: Phase 3 (hidrantes) inspector permission + session
--
-- Mirrors 0026's Phase 2 columns. pode_fase3 is opt-in (default false) so nobody
-- is silently granted hydrant access; the Phase 3 work-session is independent of
-- Phases 1 and 2 (its own start/end commands), so phases never bleed into each
-- other and no tokens are spent on the wrong phase.
-- =============================================================================

ALTER TABLE inspetores
  ADD COLUMN IF NOT EXISTS pode_fase3 BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS em_sessao_fase3           BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sessao_fase3_iniciada_em  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sessao_fase3_atividade_em TIMESTAMPTZ;

UPDATE inspetores SET pode_fase3 = COALESCE(pode_fase3, false);
