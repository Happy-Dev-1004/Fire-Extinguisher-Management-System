-- =============================================================================
-- MIGRATION 0018: AI analysis must NOT overwrite registry constants
--
-- tipo_carga, capacidade and setor are FIXED registry data (registered once per
-- extinguisher — they describe the physical unit and its location, which do not
-- change between monthly inspections). The previous aplicar_inspecao_extintor
-- overwrote them with whatever the AI read from the photo, corrupting the
-- carefully-registered constants.
--
-- This version DROPS those three columns from the inspection UPDATE entirely:
-- the AI only fills inspection-specific fields (vencimentos, checklist, photos,
-- status, inspetor). Constants are changed only via manual dashboard edits.
-- The function signature is unchanged (the p_tipo_carga/p_capacidade/p_setor
-- params are simply ignored) so the application needs no change.
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
     SET -- tipo_carga, capacidade, setor are intentionally NOT updated here:
         -- they are fixed registry constants set during registration.
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
         status_inspecao   = 'aguardando_verificacao',
         verificado_por    = NULL,
         verificado_em     = NULL
   WHERE regiao = p_regiao AND numero_int = p_numero_int
  RETURNING id INTO slot_id;

  RETURN slot_id;  -- NULL if no slot matched
END;
$$;
