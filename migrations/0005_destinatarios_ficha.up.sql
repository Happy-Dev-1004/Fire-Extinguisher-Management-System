-- =============================================================================
-- MIGRATION 0005: destinatarios_ficha
--
-- Stores WhatsApp recipients for the monthly inspection PDF (ficha).
--
-- SCOPE MODEL
-- -----------
-- unidade = "<site name>"  → recipient gets that site's ficha only
-- unidade = "*"            → recipient gets EVERY site's ficha
--
-- When resolving recipients for a send to site "Itabuna":
--   SELECT WHERE (unidade = 'Itabuna' OR unidade = '*') AND ativo = true
--   De-duplicate by telefone_normalizado (a person who is both site-specific
--   and all-units gets exactly one copy).
--
-- PHONE NORMALIZATION
-- -------------------
-- telefone_normalizado: strip non-digits, keep last 11 (Brazilian DDD + mobile).
-- Uniqueness is enforced per scope: the same phone CAN appear once as
-- site-specific and once as all-units, because those are logically
-- separate subscriptions.  Within the same scope it must be unique
-- (partial unique index).
--
-- SOFT DELETE
-- -----------
-- ativo = false removes the recipient from all future sends without losing
-- the history of who received past fichas.
-- =============================================================================

CREATE TABLE IF NOT EXISTS destinatarios_ficha (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 TEXT        NOT NULL,
  telefone             TEXT        NOT NULL,            -- raw input as typed
  telefone_normalizado TEXT        NOT NULL,            -- canonical last-11-digits
  unidade              TEXT        NOT NULL,            -- site name OR '*' for all
  ativo                BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Within a scope (unidade), only one active recipient per normalized phone.
-- Different scopes are independent, so the same phone can be both
-- site-specific and all-units without conflicting.
CREATE UNIQUE INDEX IF NOT EXISTS destinatarios_ficha_phone_unidade_unique
  ON destinatarios_ficha (telefone_normalizado, unidade)
  WHERE ativo = true;

-- Fast lookup for the send path (called on every ficha dispatch).
CREATE INDEX IF NOT EXISTS destinatarios_ficha_unidade_ativo_idx
  ON destinatarios_ficha (unidade, ativo);
