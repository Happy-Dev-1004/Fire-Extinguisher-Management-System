ALTER TABLE extintores
  DROP COLUMN IF EXISTS status_ativo,
  DROP COLUMN IF EXISTS data_baixa,
  DROP COLUMN IF EXISTS motivo_baixa;
