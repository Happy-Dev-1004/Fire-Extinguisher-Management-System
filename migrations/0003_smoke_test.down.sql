-- =============================================================================
-- MIGRATION 0003: smoke_test (rollback)
-- =============================================================================

ALTER TABLE lotes_fotos
  DROP COLUMN IF EXISTS migration_smoke_test;
