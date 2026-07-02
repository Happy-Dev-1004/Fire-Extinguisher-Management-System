-- =============================================================================
-- MIGRATION 0035: execution schedule for the alarm system (cronograma por área)
--
-- The client presents an execution timeline to their customer with a target
-- delivery date per ÁREA. An "área" here = a (central + setor) pair — the same
-- setor name can exist under different centrais, so the schedule is scoped to
-- the central it belongs to (per the agreed design).
--
-- One row per (central_id, setor) with the target date. Progress (pendente →
-- instalado → endereçado → testado) is computed live from dispositivos_alarme in
-- the API — not stored here — so the schedule always reflects real device state.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cronograma_alarme (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  central_id     UUID        NOT NULL REFERENCES centrais(id) ON DELETE CASCADE,
  setor          TEXT        NOT NULL,
  data_prevista  DATE,                       -- target delivery date (nullable until set)
  observacoes    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (central_id, setor)
);

CREATE INDEX IF NOT EXISTS cronograma_alarme_central_idx ON cronograma_alarme (central_id);

ALTER TABLE cronograma_alarme DISABLE ROW LEVEL SECURITY;

-- keep updated_at fresh on any change
CREATE OR REPLACE FUNCTION cronograma_alarme_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS cronograma_alarme_set_updated_at ON cronograma_alarme;
CREATE TRIGGER cronograma_alarme_set_updated_at
  BEFORE UPDATE ON cronograma_alarme
  FOR EACH ROW EXECUTE FUNCTION cronograma_alarme_touch_updated_at();
