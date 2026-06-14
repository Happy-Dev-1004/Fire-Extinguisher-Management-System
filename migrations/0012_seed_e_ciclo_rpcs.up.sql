-- =============================================================================
-- MIGRATION 0012: seed the 695 slots + cycle-management RPCs
--
-- Provides:
--   seed_extintores()          -> creates the 1..N empty slots for every region
--   iniciar_novo_ciclo(mes, by)-> archives the active cycle, resets all
--                                 extinguishers to nao_inspecionado, opens a new
--                                 cycle, and returns the new cycle id
--
-- Both are idempotent / safe to re-run. The seed only inserts missing slots.
-- =============================================================================

-- ── seed_extintores ───────────────────────────────────────────────────────────
-- For each region, ensure slots numbered 1..total_extintores exist. Existing
-- slots are left untouched; only missing ones are inserted as empty/uninspected.
CREATE OR REPLACE FUNCTION seed_extintores()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  r         RECORD;
  inseridos INTEGER := 0;
  este_lote INTEGER;
BEGIN
  FOR r IN SELECT nome, total_extintores FROM regioes LOOP
    INSERT INTO extintores (
      numero, numero_int, regiao, unidade, setor, tipo_carga,
      status_inspecao, fotos
    )
    SELECT
      gs::text, gs, r.nome, r.nome, '', '',
      'nao_inspecionado', '{}'::text[]
    FROM generate_series(1, r.total_extintores) AS gs
    WHERE NOT EXISTS (
      SELECT 1 FROM extintores e
       WHERE e.regiao = r.nome AND e.numero_int = gs
    );
    -- GET DIAGNOSTICS only assigns a raw value (no expressions), so accumulate
    -- via a temp variable.
    GET DIAGNOSTICS este_lote = ROW_COUNT;
    inseridos := inseridos + este_lote;
  END LOOP;
  RETURN inseridos;
END;
$$;

-- ── iniciar_novo_ciclo ────────────────────────────────────────────────────────
-- Archives the current active cycle and opens a new one, resetting every
-- extinguisher's per-cycle state to empty/uninspected. The previous cycle's
-- inspecoes rows remain (tagged with their ciclo_id) as history.
CREATE OR REPLACE FUNCTION iniciar_novo_ciclo(p_mes TEXT, p_by UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  novo_id UUID;
BEGIN
  -- Archive any currently-active cycle.
  UPDATE ciclos
     SET status = 'arquivado', arquivado_em = now()
   WHERE status = 'ativo';

  -- Reset every extinguisher to a clean, uninspected slot for the new cycle.
  UPDATE extintores
     SET status_inspecao    = 'nao_inspecionado',
         verificado_por     = NULL,
         verificado_em      = NULL,
         inspecionado_em    = NULL,
         inspetor           = NULL,
         vencimento_carga   = NULL,
         vencimento_teste   = NULL,
         lacre              = NULL,
         manometro          = NULL,
         sinalizacao_parede = NULL,
         sinalizacao_piso   = NULL,
         suporte            = NULL,
         mangueira          = NULL,
         quadro_instrucao   = NULL,
         status_geral       = NULL,
         observacoes        = NULL,
         fotos              = '{}'::text[]
   WHERE regiao IS NOT NULL;

  INSERT INTO ciclos (mes_referencia, status, iniciado_por)
  VALUES (p_mes, 'ativo', p_by)
  RETURNING id INTO novo_id;

  RETURN novo_id;
END;
$$;
