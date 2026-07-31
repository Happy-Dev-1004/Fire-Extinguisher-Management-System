-- =============================================================================
-- MIGRATION 0040 (down): remove as colunas de planejamento do cronograma
--
-- ATENÇÃO: apaga os percentuais de área e as datas previstas/reais digitadas.
-- data_prevista (entrega oficial) NÃO é tocada — ela é anterior a esta migration.
-- =============================================================================

ALTER TABLE cronograma_alarme DROP CONSTRAINT IF EXISTS cronograma_pct_area_check;

ALTER TABLE cronograma_alarme
  DROP COLUMN IF EXISTS pct_area,
  DROP COLUMN IF EXISTS data_inicio_prevista,
  DROP COLUMN IF EXISTS data_entrega_prevista,
  DROP COLUMN IF EXISTS data_inicio_real,
  DROP COLUMN IF EXISTS data_fim_real;
