ALTER TABLE inspetores
  DROP COLUMN IF EXISTS em_sessao,
  DROP COLUMN IF EXISTS sessao_iniciada_em,
  DROP COLUMN IF EXISTS sessao_atividade_em;
