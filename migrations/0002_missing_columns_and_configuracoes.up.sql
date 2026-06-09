-- =============================================================================
-- MIGRATION 0002: missing_columns_and_configuracoes
--
-- Adds columns that the application code references but were never created
-- in the Supabase dashboard, and creates the configuracoes table needed by
-- the secrets management feature.
--
-- All ADD COLUMN statements use IF NOT EXISTS — safe to run on a DB that
-- already has some of these columns (idempotent).
-- =============================================================================

-- ── inspecoes: lote_id ────────────────────────────────────────────────────────
-- Links an inspection back to the WhatsApp photo batch that triggered it.
-- Nullable because historical inspections pre-date the batch workflow.
ALTER TABLE inspecoes
  ADD COLUMN IF NOT EXISTS lote_id UUID REFERENCES lotes_fotos(id);

CREATE UNIQUE INDEX IF NOT EXISTS inspecoes_lote_id_unique
  ON inspecoes (lote_id)
  WHERE lote_id IS NOT NULL;

-- ── inspecoes: tem_irregularidade ─────────────────────────────────────────────
-- Denormalised flag: true when status_geral = 'Reprovado'.
-- Computed by the app on insert/update; stored for fast dashboard queries.
ALTER TABLE inspecoes
  ADD COLUMN IF NOT EXISTS tem_irregularidade BOOLEAN NOT NULL DEFAULT false;

-- ── extintores: cadastro_pendente ─────────────────────────────────────────────
-- True when an extinguisher was created from a WhatsApp inspection but has
-- not yet been manually confirmed/completed by an admin.
ALTER TABLE extintores
  ADD COLUMN IF NOT EXISTS cadastro_pendente BOOLEAN NOT NULL DEFAULT false;

-- ── configuracoes ─────────────────────────────────────────────────────────────
-- Stores operational secrets encrypted at rest (AES-256-GCM).
-- ciphertext, iv, auth_tag are hex-encoded strings.
-- valor_mascarado is the display-safe masked value (never plaintext).
-- updated_by is a foreign key to admins(id) — always the owner.
CREATE TABLE IF NOT EXISTS configuracoes (
  nome            TEXT        PRIMARY KEY,
  ciphertext      TEXT        NOT NULL,
  iv              TEXT        NOT NULL,
  auth_tag        TEXT        NOT NULL,
  valor_mascarado TEXT        NOT NULL,
  updated_by      UUID        NOT NULL REFERENCES admins(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
