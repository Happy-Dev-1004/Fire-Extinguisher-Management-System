-- =============================================================================
-- MIGRATION 0027: notification & system-health alerting
--
-- Three tables:
--  • notificacoes      — the in-app notification center (bell). Activity events
--                        (sessions, photos[collapsed], installs, RDOs) and
--                        health alerts (OpenAI/Z-API). Photos collapse onto one
--                        rolling row per (inspector+region+session) via grupo_chave.
--  • uso_openai        — per-call token tally, so we can alert when monthly
--                        consumption crosses an owner-set threshold (OpenAI has
--                        no balance API; we track it ourselves).
--  • alertas_estado    — last-fired timestamp per alert key, so the hourly job
--                        de-duplicates and doesn't spam the same alert.
-- =============================================================================

CREATE TABLE IF NOT EXISTS notificacoes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT        NOT NULL,              -- 'sessao' | 'foto' | 'instalacao' | 'rdo' | 'saude'
  severidade  TEXT        NOT NULL DEFAULT 'info', -- 'info' | 'sucesso' | 'aviso' | 'critico'
  titulo      TEXT        NOT NULL,
  mensagem    TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- When set, a NEW event with the same grupo_chave UPDATES the existing
  -- (unread) row instead of inserting — this is how photo notifications collapse.
  grupo_chave TEXT,
  -- 'owner' = only the owner sees it (health/credit). 'admin' = owner + members.
  escopo      TEXT        NOT NULL DEFAULT 'admin',
  lida        BOOLEAN     NOT NULL DEFAULT false,
  contador    INTEGER     NOT NULL DEFAULT 1,    -- how many events folded into this row
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notificacoes_lida_idx       ON notificacoes (lida, created_at DESC);
CREATE INDEX IF NOT EXISTS notificacoes_escopo_idx     ON notificacoes (escopo);
-- A grupo_chave is only "open" for collapsing while it's unread; partial unique
-- index lets us upsert onto the current open group without blocking history.
CREATE UNIQUE INDEX IF NOT EXISTS notificacoes_grupo_aberto_idx
  ON notificacoes (grupo_chave) WHERE grupo_chave IS NOT NULL AND lida = false;

-- OpenAI token consumption — one row per analysed batch (or per call).
CREATE TABLE IF NOT EXISTS uso_openai (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id       UUID,
  modelo        TEXT,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uso_openai_created_idx ON uso_openai (created_at DESC);

-- De-dup state for the periodic health job: one row per alert key, holding when
-- it last fired and a small payload so we don't re-alert every hour.
CREATE TABLE IF NOT EXISTS alertas_estado (
  chave        TEXT        PRIMARY KEY,          -- e.g. 'openai_quota', 'zapi_expira_7d'
  ultimo_disparo TIMESTAMPTZ,
  detalhe      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notificacoes   DISABLE ROW LEVEL SECURITY;
ALTER TABLE uso_openai     DISABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_estado DISABLE ROW LEVEL SECURITY;
