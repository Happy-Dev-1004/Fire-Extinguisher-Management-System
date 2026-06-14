-- =============================================================================
-- MIGRATION 0011: regions, inspection cycles, 3-state status, verification
--
-- Reshapes the system from "extinguishers are created when a photo arrives" to
-- "the full inventory is pre-registered by region, and each monthly cycle tracks
-- a 3-state status per extinguisher". Region REPLACES the old free-text unidade.
--
-- Status lifecycle per extinguisher, per cycle:
--   nao_inspecionado  -> aguardando_verificacao -> verificado
--   (empty)              (AI stored values)         (human confirmed)
--
-- Every statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE) so the
-- migration is safe to re-run.
-- =============================================================================

-- ── regioes ───────────────────────────────────────────────────────────────────
-- The 6 fixed regions and how many extinguishers each holds. total_extintores is
-- the authoritative count used to pre-seed slots (numbers 1..total per region).
CREATE TABLE IF NOT EXISTS regioes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             TEXT        NOT NULL UNIQUE,
  total_extintores INTEGER     NOT NULL CHECK (total_extintores > 0),
  ordem            INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO regioes (nome, total_extintores, ordem) VALUES
  ('Barry Itabuna',   276, 1),
  ('Ilhéus',          300, 2),
  ('CW Itabuna',       38, 3),
  ('CW Ilhéus',        52, 4),
  ('Viveiro Itabuna',  12, 5),
  ('Viveiro Ilhéus',   17, 6)
ON CONFLICT (nome) DO UPDATE
  SET total_extintores = EXCLUDED.total_extintores,
      ordem            = EXCLUDED.ordem;

-- ── ciclos ────────────────────────────────────────────────────────────────────
-- An inspection cycle (a month of work). Exactly one cycle is 'ativo' at a time.
-- Starting a new cycle archives the previous one (status -> 'arquivado') and
-- resets every extinguisher to 'nao_inspecionado' for the new cycle.
CREATE TABLE IF NOT EXISTS ciclos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_referencia TEXT        NOT NULL,            -- e.g. "Junho/2026"
  status         TEXT        NOT NULL DEFAULT 'ativo', -- 'ativo' | 'arquivado'
  iniciado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  arquivado_em   TIMESTAMPTZ,
  iniciado_por   UUID        REFERENCES admins(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one active cycle.
CREATE UNIQUE INDEX IF NOT EXISTS ciclos_um_ativo
  ON ciclos (status)
  WHERE status = 'ativo';

-- ── extintores: add region, number is per-region, current-cycle status ────────
-- New columns layered onto the existing table. regiao replaces unidade as the
-- grouping; numero_int is the sequential per-region number (1..N).
ALTER TABLE extintores
  ADD COLUMN IF NOT EXISTS regiao            TEXT,
  ADD COLUMN IF NOT EXISTS numero_int        INTEGER,
  ADD COLUMN IF NOT EXISTS status_inspecao   TEXT NOT NULL DEFAULT 'nao_inspecionado',
  ADD COLUMN IF NOT EXISTS verificado_por    UUID REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS verificado_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inspecionado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lacre             TEXT,
  ADD COLUMN IF NOT EXISTS manometro         TEXT,
  ADD COLUMN IF NOT EXISTS sinalizacao_parede TEXT,
  ADD COLUMN IF NOT EXISTS sinalizacao_piso  TEXT,
  ADD COLUMN IF NOT EXISTS suporte           TEXT,
  ADD COLUMN IF NOT EXISTS mangueira         TEXT,
  ADD COLUMN IF NOT EXISTS quadro_instrucao  TEXT,
  ADD COLUMN IF NOT EXISTS status_geral      TEXT,
  ADD COLUMN IF NOT EXISTS observacoes       TEXT,
  ADD COLUMN IF NOT EXISTS fotos             TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inspetor          TEXT;

-- A pre-seeded slot is uniquely identified by (regiao, numero_int).
CREATE UNIQUE INDEX IF NOT EXISTS extintores_regiao_numero
  ON extintores (regiao, numero_int)
  WHERE regiao IS NOT NULL AND numero_int IS NOT NULL;

CREATE INDEX IF NOT EXISTS extintores_regiao_idx ON extintores (regiao);
CREATE INDEX IF NOT EXISTS extintores_status_idx ON extintores (status_inspecao);

-- ── inspecoes_pendentes ───────────────────────────────────────────────────────
-- Holds analysed batches whose caption number is out of range / non-numeric, so
-- the owner can manually assign them to the right slot. Nothing is ever dropped.
CREATE TABLE IF NOT EXISTS inspecoes_pendentes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  regiao        TEXT,
  legenda       TEXT,
  numero_lido   TEXT,
  payload       JSONB       NOT NULL,   -- full RespostaIA the AI produced
  fotos         TEXT[]      NOT NULL DEFAULT '{}',
  lote_id       UUID,
  resolvido     BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── inspetores: active region context for the current WhatsApp session ────────
ALTER TABLE inspetores
  ADD COLUMN IF NOT EXISTS regiao_contexto TEXT;

-- ── inspecoes: tag each historical inspection with its region + cycle ─────────
ALTER TABLE inspecoes
  ADD COLUMN IF NOT EXISTS regiao   TEXT,
  ADD COLUMN IF NOT EXISTS ciclo_id UUID REFERENCES ciclos(id),
  ADD COLUMN IF NOT EXISTS verificado BOOLEAN NOT NULL DEFAULT false;
