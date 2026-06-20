ALTER TABLE inspetores
  DROP COLUMN IF EXISTS sessao_fase2_atividade_em,
  DROP COLUMN IF EXISTS sessao_fase2_iniciada_em,
  DROP COLUMN IF EXISTS em_sessao_fase2,
  DROP COLUMN IF EXISTS pode_fase2,
  DROP COLUMN IF EXISTS pode_fase1;
