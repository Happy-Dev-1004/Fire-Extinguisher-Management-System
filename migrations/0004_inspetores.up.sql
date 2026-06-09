-- =============================================================================
-- MIGRATION 0004: inspetores
--
-- Creates the inspetores table for field inspectors whose WhatsApp numbers
-- are authorized to send photos via webhook.
--
-- These are DATA records, entirely separate from the admins (login) table.
-- Soft-delete via ativo=false preserves referential integrity: an inactive
-- inspector's historical inspection records remain queryable.
--
-- telefone_normalizado stores the canonical form produced by normalizar():
--   strip non-digits → keep last 11 digits (Brazilian DDD + 9-digit mobile).
-- The unique index covers only active rows so the same number can be
-- re-added after being deactivated (e.g. a returning contractor).
-- =============================================================================

CREATE TABLE IF NOT EXISTS inspetores (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 TEXT        NOT NULL,
  telefone             TEXT        NOT NULL,           -- raw input as typed
  telefone_normalizado TEXT        NOT NULL,           -- canonical 11-digit form
  ativo                BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active inspector may hold a given normalized number at a time.
-- Inactive rows are excluded so a number can be reactivated without a conflict.
CREATE UNIQUE INDEX IF NOT EXISTS inspetores_telefone_normalizado_ativo_unique
  ON inspetores (telefone_normalizado)
  WHERE ativo = true;

-- Fast lookup for the webhook authorization path (called on every photo message).
CREATE INDEX IF NOT EXISTS inspetores_telefone_normalizado_idx
  ON inspetores (telefone_normalizado);
