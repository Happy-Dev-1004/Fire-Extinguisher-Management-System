ALTER TABLE inspetores
  DROP COLUMN IF EXISTS sessao_fase3_atividade_em,
  DROP COLUMN IF EXISTS sessao_fase3_iniciada_em,
  DROP COLUMN IF EXISTS em_sessao_fase3,
  DROP COLUMN IF EXISTS pode_fase3;
