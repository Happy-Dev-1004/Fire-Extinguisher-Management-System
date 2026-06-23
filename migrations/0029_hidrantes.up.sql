-- =============================================================================
-- MIGRATION 0029: PHASE 3 — fire hydrants (hidrantes)
--
-- Mirrors the Phase 1 (extintores) regional model, adapted for hydrants:
--   • unidades_hidrante  — the hydrant units (e.g. "EDP"), independent of the
--                          extinguisher regioes. Each has a hydrant count.
--   • hidrantes          — one row per hydrant slot (H01, H02 …). CONSTANTS
--                          (esguicho/mangueira/chave_storz/setor) are protected
--                          from AI overwrite, just like tipo_carga/setor in P1.
--   • ciclos_hidrante    — monthly inspection cycles (at most one active).
--   • inspecoes_pendentes_hidrante — AI results that couldn't be matched to a
--                          slot, parked for manual assignment (never lost).
--
-- The checklist is 4-state per item (OK | RUIM | PENDENTE | ENCAMINHAR),
-- matching the hydrant ficha columns (OK / RUIM / PENDENTE / ENCAMINHAR MANUTENÇÃO).
--
-- Inventory (unit names + counts + constants) is seeded later from the client's
-- documentation; this migration builds the structure + idempotent seed RPC.
-- =============================================================================

-- ── Units ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unidades_hidrante (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT        NOT NULL UNIQUE,        -- e.g. "EDP"
  total_hidrantes INTEGER     NOT NULL DEFAULT 0,
  ordem           INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Cycles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ciclos_hidrante (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_referencia TEXT,
  status        TEXT        NOT NULL DEFAULT 'ativo',   -- 'ativo' | 'arquivado'
  iniciado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  arquivado_em  TIMESTAMPTZ,
  iniciado_por  UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Hydrant slots ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hidrantes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          TEXT        NOT NULL,       -- display id, e.g. "H01" or "1"
  numero_int      INTEGER     NOT NULL,       -- per-unit slot number (1..N)
  unidade         TEXT        NOT NULL,       -- FK-by-name to unidades_hidrante.nome

  -- CONSTANTS (registered once, NEVER overwritten by AI):
  setor           TEXT,                       -- physical location/sector
  esguicho        TEXT,                       -- nozzle (constant per hydrant)
  mangueira       TEXT,                       -- hose (constant per hydrant)
  chave_storz     TEXT,                       -- Storz wrench (constant per hydrant)

  -- Per-cycle checklist (4-state each): OK | RUIM | PENDENTE | ENCAMINHAR | N.A
  c_esguicho            TEXT,
  c_condicoes_caixa     TEXT,
  c_condicoes_acesso    TEXT,
  c_identificacao_piso  TEXT,
  c_identificacao_placa TEXT,
  c_mangueira           TEXT,
  c_adaptador           TEXT,
  c_chave_storz         TEXT,
  c_teste               TEXT,
  c_tampa_hidrante      TEXT,

  status_geral    TEXT,
  observacoes     TEXT,
  inspetor        TEXT,
  fotos           TEXT[]      NOT NULL DEFAULT '{}',

  -- Inspection lifecycle (3-state, same as extintores):
  status_inspecao TEXT        NOT NULL DEFAULT 'nao_inspecionado',  -- nao_inspecionado | aguardando_verificacao | verificado
  inspecionado_em TIMESTAMPTZ,
  verificado_por  UUID,
  verificado_em   TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (unidade, numero_int)
);
CREATE INDEX IF NOT EXISTS hidrantes_unidade_idx ON hidrantes (unidade);
CREATE INDEX IF NOT EXISTS hidrantes_status_idx  ON hidrantes (status_inspecao);

-- ── Parked AI results (never lose an analysis) ──────────────────────────────
CREATE TABLE IF NOT EXISTS inspecoes_pendentes_hidrante (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade     TEXT,
  legenda     TEXT,
  numero_lido TEXT,
  payload     JSONB,
  fotos       TEXT[]      NOT NULL DEFAULT '{}',
  lote_id     UUID,
  resolvido   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insp_pend_hidrante_resolvido_idx ON inspecoes_pendentes_hidrante (resolvido);

ALTER TABLE unidades_hidrante            DISABLE ROW LEVEL SECURITY;
ALTER TABLE ciclos_hidrante              DISABLE ROW LEVEL SECURITY;
ALTER TABLE hidrantes                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE inspecoes_pendentes_hidrante DISABLE ROW LEVEL SECURITY;

-- Photo batches are shared between Phase 1 (extintor) and Phase 3 (hidrante).
-- A discriminator on the batch routes it to the right analyser. Existing rows
-- default to 'extintor' (the historical behaviour).
ALTER TABLE lotes_fotos ADD COLUMN IF NOT EXISTS fase TEXT NOT NULL DEFAULT 'extintor';

-- ── updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hidrantes_touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS hidrantes_updated_at ON hidrantes;
CREATE TRIGGER hidrantes_updated_at BEFORE UPDATE ON hidrantes
  FOR EACH ROW EXECUTE FUNCTION hidrantes_touch_updated_at();

-- ── seed_hidrantes() — create 1..N empty slots per unit (idempotent) ────────
CREATE OR REPLACE FUNCTION seed_hidrantes()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  u         RECORD;
  inseridos INTEGER := 0;
  este_lote INTEGER;
BEGIN
  FOR u IN SELECT nome, total_hidrantes FROM unidades_hidrante LOOP
    INSERT INTO hidrantes (numero, numero_int, unidade, setor, status_inspecao, fotos)
    SELECT
      'H' || lpad(gs::text, 2, '0'), gs, u.nome, '', 'nao_inspecionado', '{}'::text[]
    FROM generate_series(1, u.total_hidrantes) AS gs
    WHERE NOT EXISTS (
      SELECT 1 FROM hidrantes h WHERE h.unidade = u.nome AND h.numero_int = gs
    );
    GET DIAGNOSTICS este_lote = ROW_COUNT;
    inseridos := inseridos + este_lote;
  END LOOP;

  -- Open the first cycle if none exists yet.
  IF NOT EXISTS (SELECT 1 FROM ciclos_hidrante WHERE status = 'ativo') THEN
    INSERT INTO ciclos_hidrante (mes_referencia, status) VALUES (NULL, 'ativo');
  END IF;

  RETURN inseridos;
END;
$$;

-- ── aplicar_inspecao_hidrante() — apply an inspection WITHOUT touching constants
-- esguicho/mangueira/chave_storz/setor are constants → never updated here.
CREATE OR REPLACE FUNCTION aplicar_inspecao_hidrante(
  p_unidade               TEXT,
  p_numero_int            INTEGER,
  p_inspetor              TEXT,
  p_c_esguicho            TEXT,
  p_c_condicoes_caixa     TEXT,
  p_c_condicoes_acesso    TEXT,
  p_c_identificacao_piso  TEXT,
  p_c_identificacao_placa TEXT,
  p_c_mangueira           TEXT,
  p_c_adaptador           TEXT,
  p_c_chave_storz         TEXT,
  p_c_teste               TEXT,
  p_c_tampa_hidrante      TEXT,
  p_status_geral          TEXT,
  p_observacoes           TEXT,
  p_fotos                 TEXT[]
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
  UPDATE hidrantes
     SET inspetor              = p_inspetor,
         c_esguicho            = p_c_esguicho,
         c_condicoes_caixa     = p_c_condicoes_caixa,
         c_condicoes_acesso    = p_c_condicoes_acesso,
         c_identificacao_piso  = p_c_identificacao_piso,
         c_identificacao_placa = p_c_identificacao_placa,
         c_mangueira           = p_c_mangueira,
         c_adaptador           = p_c_adaptador,
         c_chave_storz         = p_c_chave_storz,
         c_teste               = p_c_teste,
         c_tampa_hidrante      = p_c_tampa_hidrante,
         status_geral          = p_status_geral,
         observacoes           = p_observacoes,
         fotos                 = p_fotos,
         inspecionado_em       = now(),
         status_inspecao       = 'aguardando_verificacao',
         verificado_por        = NULL,
         verificado_em         = NULL
   WHERE unidade = p_unidade AND numero_int = p_numero_int
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── iniciar_novo_ciclo_hidrante() — archive + reset all hydrants ─────────────
CREATE OR REPLACE FUNCTION iniciar_novo_ciclo_hidrante(p_mes TEXT, p_by UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE novo_id UUID;
BEGIN
  UPDATE ciclos_hidrante SET status = 'arquivado', arquivado_em = now() WHERE status = 'ativo';

  UPDATE hidrantes
     SET status_inspecao = 'nao_inspecionado',
         verificado_por = NULL, verificado_em = NULL, inspecionado_em = NULL,
         inspetor = NULL,
         c_esguicho = NULL, c_condicoes_caixa = NULL, c_condicoes_acesso = NULL,
         c_identificacao_piso = NULL, c_identificacao_placa = NULL, c_mangueira = NULL,
         c_adaptador = NULL, c_chave_storz = NULL, c_teste = NULL, c_tampa_hidrante = NULL,
         status_geral = NULL, observacoes = NULL, fotos = '{}'::text[]
   WHERE unidade IS NOT NULL;

  INSERT INTO ciclos_hidrante (mes_referencia, status, iniciado_por)
  VALUES (p_mes, 'ativo', p_by) RETURNING id INTO novo_id;
  RETURN novo_id;
END;
$$;
