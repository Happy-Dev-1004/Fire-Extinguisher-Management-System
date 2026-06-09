-- =============================================================================
-- MIGRATION 0003: smoke_test
--
-- Adds a harmless nullable TEXT column to lotes_fotos as a workflow smoke test.
-- This migration exists to prove that migrate:up / migrate:down work end-to-end.
-- It can be left in permanently (a nullable column with no default is zero-cost)
-- or rolled back with migrate:down.
-- =============================================================================

ALTER TABLE lotes_fotos
  ADD COLUMN IF NOT EXISTS migration_smoke_test TEXT;
