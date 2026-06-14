-- =============================================================================
-- MIGRATION 0013: aplicar_inspecao_extintor RPC
--
-- Writes an AI analysis result onto a pre-seeded slot (regiao + numero_int) in
-- one atomic statement. Sets status to 'aguardando_verificacao'. If the slot was
-- already 'verificado', it reverts to 'aguardando_verificacao' (new data must be
-- re-checked by a human). Overwrites existing values (re-inspection = newest wins).
--
-- Returns the slot id, or NULL if no matching slot exists (caller then routes the
-- result to inspecoes_pendentes for manual assignment).
-- =============================================================================

CREATE OR REPLACE FUNCTION aplicar_inspecao_extintor(
  p_regiao             TEXT,
  p_numero_int         INTEGER,
  p_tipo_carga         TEXT,
  p_capacidade         TEXT,
  p_vencimento_carga   TEXT,
  p_vencimento_teste   TEXT,
  p_inspetor           TEXT,
  p_lacre              TEXT,
  p_manometro          TEXT,
  p_sinalizacao_parede TEXT,
  p_sinalizacao_piso   TEXT,
  p_suporte            TEXT,
  p_mangueira          TEXT,
  p_quadro_instrucao   TEXT,
  p_status_geral       TEXT,
  p_observacoes        TEXT,
  p_setor              TEXT,
  p_fotos              TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  slot_id UUID;
BEGIN
  UPDATE extintores
     SET tipo_carga        = COALESCE(NULLIF(p_tipo_carga, ''), tipo_carga),
         capacidade        = COALESCE(NULLIF(p_capacidade, ''), capacidade),
         setor             = COALESCE(NULLIF(p_setor, ''), setor),
         vencimento_carga  = p_vencimento_carga,
         vencimento_teste  = p_vencimento_teste,
         inspetor          = p_inspetor,
         lacre             = p_lacre,
         manometro         = p_manometro,
         sinalizacao_parede= p_sinalizacao_parede,
         sinalizacao_piso  = p_sinalizacao_piso,
         suporte           = p_suporte,
         mangueira         = p_mangueira,
         quadro_instrucao  = p_quadro_instrucao,
         status_geral      = p_status_geral,
         observacoes       = p_observacoes,
         fotos             = p_fotos,
         inspecionado_em   = now(),
         -- New AI data always lands as awaiting human verification, even if it
         -- was previously verified.
         status_inspecao   = 'aguardando_verificacao',
         verificado_por    = NULL,
         verificado_em     = NULL
   WHERE regiao = p_regiao AND numero_int = p_numero_int
  RETURNING id INTO slot_id;

  RETURN slot_id;  -- NULL if no slot matched
END;
$$;
