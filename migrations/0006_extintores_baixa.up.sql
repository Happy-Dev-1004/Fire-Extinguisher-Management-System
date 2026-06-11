-- =============================================================================
-- MIGRATION 0006: extintores — soft-retire (baixa) columns
--
-- Adds the three columns needed to mark an extinguisher as disposed/retired:
--   status_ativo  — false = retired (descartado); defaults true for all existing rows
--   data_baixa    — ISO date when the extinguisher was retired
--   motivo_baixa  — free-text reason (e.g. "Carga vencida sem possibilidade de recarga")
-- =============================================================================

ALTER TABLE extintores
  ADD COLUMN IF NOT EXISTS status_ativo   BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS data_baixa     DATE,
  ADD COLUMN IF NOT EXISTS motivo_baixa   TEXT;
