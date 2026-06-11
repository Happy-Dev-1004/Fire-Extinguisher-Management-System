-- =============================================================================
-- MIGRATION 0009: destinatarios_ficha.email
--
-- Adds an optional email address to each report recipient. A recipient can now
-- receive the monthly inspection PDF via WhatsApp (telefone), email, or BOTH.
--
-- The phone columns remain NOT NULL for backward compatibility, but going
-- forward at least ONE channel (phone or email) must be present — that rule is
-- enforced at the application layer (POST/PUT /destinatarios), not the DB,
-- because existing rows already satisfy it via telefone.
-- =============================================================================

ALTER TABLE destinatarios_ficha
  ADD COLUMN IF NOT EXISTS email TEXT;
