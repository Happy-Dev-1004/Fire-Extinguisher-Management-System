-- =============================================================================
-- MIGRATION 0002: missing_columns_and_configuracoes (rollback)
-- =============================================================================

DROP TABLE IF EXISTS configuracoes;

ALTER TABLE extintores  DROP COLUMN IF EXISTS cadastro_pendente;
ALTER TABLE inspecoes   DROP COLUMN IF EXISTS tem_irregularidade;

DROP INDEX IF EXISTS inspecoes_lote_id_unique;
ALTER TABLE inspecoes   DROP COLUMN IF EXISTS lote_id;
