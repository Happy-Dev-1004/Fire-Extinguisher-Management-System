-- =============================================================================
-- MIGRATION 0024: RDO (Relatório Diário de Obra) — conversational capture
--
-- Two tables:
--   rdos         — the assembled daily report (sections 1-8 of the approved model)
--   rdo_sessoes  — per-phone conversation state for the guided WhatsApp flow,
--                  so a session survives across individual messages and two
--                  supervisors can capture independently at the same time.
--
-- The structured sub-sections (efetivo, equipamentos, atividades, dispositivos,
-- atrasos) are JSONB so the question set can grow without schema changes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS rdos (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- § Identificação
  data                     DATE,
  responsavel              TEXT,
  periodo                  TEXT        CHECK (periodo IN ('diurno','noturno')),
  clima                    TEXT,
  -- § Localização / frente
  central                  TEXT,
  laco                     TEXT,
  frente_trabalho          TEXT,
  -- § Efetivo (counts per role) e equipamentos
  efetivo                  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  equipamentos_uso         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- § Atividades executadas
  atividades               JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- § Dispositivos instalados no dia (counts per device type)
  dispositivos_instalados  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- § Segurança / integração
  pt_numero                TEXT,
  integracao_novos         BOOLEAN,
  -- § Ocorrências e planejamento
  ocorrencias              TEXT,
  atrasos                  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  planejamento_proximo_dia TEXT,
  -- § Registro fotográfico do dia
  fotos_dia                TEXT[]      NOT NULL DEFAULT '{}',
  -- control
  status                   TEXT        NOT NULL DEFAULT 'em_andamento'
                             CHECK (status IN ('em_andamento','concluido','cancelado')),
  telefone_origem          TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS rdos_status_idx   ON rdos (status);
CREATE INDEX IF NOT EXISTS rdos_data_idx     ON rdos (data);
CREATE INDEX IF NOT EXISTS rdos_telefone_idx ON rdos (telefone_origem);

-- ── rdo_sessoes — one ACTIVE session per phone ────────────────────────────────
-- etapa = index into the question list. ultima_msg_id makes message handling
-- idempotent: a duplicate Z-API delivery with the same messageId is ignored, so
-- it can't double-advance the session.
CREATE TABLE IF NOT EXISTS rdo_sessoes (
  telefone_normalizado TEXT        PRIMARY KEY,
  rdo_id               UUID        NOT NULL REFERENCES rdos(id) ON DELETE CASCADE,
  etapa                INTEGER     NOT NULL DEFAULT 0,
  ultima_msg_id        TEXT,
  aguardando_fotos     BOOLEAN     NOT NULL DEFAULT false,
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rdos        DISABLE ROW LEVEL SECURITY;
ALTER TABLE rdo_sessoes DISABLE ROW LEVEL SECURITY;
