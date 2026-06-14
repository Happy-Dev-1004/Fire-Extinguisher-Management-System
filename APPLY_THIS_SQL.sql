-- ============================================================================
-- RUN THIS ONCE in the Supabase SQL editor to activate the regional model.
-- https://supabase.com/dashboard/project/edjtmbqhnewtzpvxdvst/sql/new
-- It is safe and idempotent. Order: clear test data -> migrations -> seed.
-- ============================================================================

-- NOTE: migrations run FIRST (they add the columns), THEN we wipe old data,
-- because the cleanup references columns the migrations create.

-- ── STEP 1: migration 0011 (regions, cycles, status, verification columns) ──
CREATE TABLE IF NOT EXISTS regioes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  total_extintores INTEGER NOT NULL CHECK (total_extintores > 0),
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO regioes (nome, total_extintores, ordem) VALUES
  ('Barry Itabuna',276,1),('Ilhéus',300,2),('CW Itabuna',38,3),
  ('CW Ilhéus',52,4),('Viveiro Itabuna',12,5),('Viveiro Ilhéus',17,6)
ON CONFLICT (nome) DO UPDATE SET total_extintores=EXCLUDED.total_extintores, ordem=EXCLUDED.ordem;

CREATE TABLE IF NOT EXISTS ciclos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_referencia TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  arquivado_em TIMESTAMPTZ,
  iniciado_por UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ciclos_um_ativo ON ciclos (status) WHERE status='ativo';

ALTER TABLE extintores
  ADD COLUMN IF NOT EXISTS regiao TEXT,
  ADD COLUMN IF NOT EXISTS numero_int INTEGER,
  ADD COLUMN IF NOT EXISTS status_inspecao TEXT NOT NULL DEFAULT 'nao_inspecionado',
  ADD COLUMN IF NOT EXISTS verificado_por UUID REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS verificado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inspecionado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lacre TEXT,
  ADD COLUMN IF NOT EXISTS manometro TEXT,
  ADD COLUMN IF NOT EXISTS sinalizacao_parede TEXT,
  ADD COLUMN IF NOT EXISTS sinalizacao_piso TEXT,
  ADD COLUMN IF NOT EXISTS suporte TEXT,
  ADD COLUMN IF NOT EXISTS mangueira TEXT,
  ADD COLUMN IF NOT EXISTS quadro_instrucao TEXT,
  ADD COLUMN IF NOT EXISTS status_geral TEXT,
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS fotos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inspetor TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS extintores_regiao_numero ON extintores (regiao, numero_int)
  WHERE regiao IS NOT NULL AND numero_int IS NOT NULL;
CREATE INDEX IF NOT EXISTS extintores_regiao_idx ON extintores (regiao);
CREATE INDEX IF NOT EXISTS extintores_status_idx ON extintores (status_inspecao);

CREATE TABLE IF NOT EXISTS inspecoes_pendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regiao TEXT, legenda TEXT, numero_lido TEXT,
  payload JSONB NOT NULL, fotos TEXT[] NOT NULL DEFAULT '{}',
  lote_id UUID, resolvido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inspetores ADD COLUMN IF NOT EXISTS regiao_contexto TEXT;
ALTER TABLE inspecoes
  ADD COLUMN IF NOT EXISTS regiao TEXT,
  ADD COLUMN IF NOT EXISTS ciclo_id UUID REFERENCES ciclos(id),
  ADD COLUMN IF NOT EXISTS verificado BOOLEAN NOT NULL DEFAULT false;

-- ── STEP 2: migration 0012 (seed + cycle RPCs) ──────────────────────────────
CREATE OR REPLACE FUNCTION seed_extintores() RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE r RECORD; inseridos INTEGER := 0; este_lote INTEGER;
BEGIN
  FOR r IN SELECT nome, total_extintores FROM regioes LOOP
    INSERT INTO extintores (numero, numero_int, regiao, unidade, setor, tipo_carga, status_inspecao, fotos)
    SELECT gs::text, gs, r.nome, r.nome, '', '', 'nao_inspecionado', '{}'::text[]
    FROM generate_series(1, r.total_extintores) AS gs
    WHERE NOT EXISTS (SELECT 1 FROM extintores e WHERE e.regiao=r.nome AND e.numero_int=gs);
    GET DIAGNOSTICS este_lote = ROW_COUNT;
    inseridos := inseridos + este_lote;
  END LOOP;
  RETURN inseridos;
END; $$;

CREATE OR REPLACE FUNCTION iniciar_novo_ciclo(p_mes TEXT, p_by UUID) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE novo_id UUID;
BEGIN
  UPDATE ciclos SET status='arquivado', arquivado_em=now() WHERE status='ativo';
  UPDATE extintores SET status_inspecao='nao_inspecionado', verificado_por=NULL, verificado_em=NULL,
    inspecionado_em=NULL, inspetor=NULL, vencimento_carga=NULL, vencimento_teste=NULL, lacre=NULL,
    manometro=NULL, sinalizacao_parede=NULL, sinalizacao_piso=NULL, suporte=NULL, mangueira=NULL,
    quadro_instrucao=NULL, status_geral=NULL, observacoes=NULL, fotos='{}'::text[]
   WHERE regiao IS NOT NULL;
  INSERT INTO ciclos (mes_referencia, status, iniciado_por) VALUES (p_mes,'ativo',p_by) RETURNING id INTO novo_id;
  RETURN novo_id;
END; $$;

-- ── STEP 3: migration 0013 (apply-inspection RPC) ───────────────────────────
CREATE OR REPLACE FUNCTION aplicar_inspecao_extintor(
  p_regiao TEXT, p_numero_int INTEGER, p_tipo_carga TEXT, p_capacidade TEXT,
  p_vencimento_carga TEXT, p_vencimento_teste TEXT, p_inspetor TEXT, p_lacre TEXT,
  p_manometro TEXT, p_sinalizacao_parede TEXT, p_sinalizacao_piso TEXT, p_suporte TEXT,
  p_mangueira TEXT, p_quadro_instrucao TEXT, p_status_geral TEXT, p_observacoes TEXT,
  p_setor TEXT, p_fotos TEXT[]
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE slot_id UUID;
BEGIN
  UPDATE extintores SET
    tipo_carga=COALESCE(NULLIF(p_tipo_carga,''),tipo_carga),
    capacidade=COALESCE(NULLIF(p_capacidade,''),capacidade),
    setor=COALESCE(NULLIF(p_setor,''),setor),
    vencimento_carga=p_vencimento_carga, vencimento_teste=p_vencimento_teste,
    inspetor=p_inspetor, lacre=p_lacre, manometro=p_manometro,
    sinalizacao_parede=p_sinalizacao_parede, sinalizacao_piso=p_sinalizacao_piso,
    suporte=p_suporte, mangueira=p_mangueira, quadro_instrucao=p_quadro_instrucao,
    status_geral=p_status_geral, observacoes=p_observacoes, fotos=p_fotos,
    inspecionado_em=now(), status_inspecao='aguardando_verificacao',
    verificado_por=NULL, verificado_em=NULL
   WHERE regiao=p_regiao AND numero_int=p_numero_int
  RETURNING id INTO slot_id;
  RETURN slot_id;
END; $$;

-- ── STEP 4: NOW wipe old test data (columns exist by this point) ────────────
-- Legacy free-text inspections/extinguishers + stale photo batches.
DELETE FROM inspecoes WHERE regiao IS NULL OR extintor_unidade NOT IN (
  'Barry Itabuna','Ilhéus','CW Itabuna','CW Ilhéus','Viveiro Itabuna','Viveiro Ilhéus'
);
DELETE FROM extintores WHERE regiao IS NULL;
DELETE FROM lotes_fotos;

-- ── STEP 5: seed the 695 slots + open the first cycle ───────────────────────
SELECT seed_extintores();   -- creates the empty slots; returns how many inserted
INSERT INTO ciclos (mes_referencia, status)
SELECT 'Junho/2026', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM ciclos WHERE status='ativo');

-- ── VERIFY (optional) ───────────────────────────────────────────────────────
SELECT regiao, count(*) FROM extintores WHERE regiao IS NOT NULL GROUP BY regiao ORDER BY regiao;
