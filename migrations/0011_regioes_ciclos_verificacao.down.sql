-- Reverses migration 0011. Drops added columns/tables. Does not restore data.
ALTER TABLE inspecoes
  DROP COLUMN IF EXISTS regiao,
  DROP COLUMN IF EXISTS ciclo_id,
  DROP COLUMN IF EXISTS verificado;

ALTER TABLE inspetores
  DROP COLUMN IF EXISTS regiao_contexto;

DROP TABLE IF EXISTS inspecoes_pendentes;

ALTER TABLE extintores
  DROP COLUMN IF EXISTS regiao,
  DROP COLUMN IF EXISTS numero_int,
  DROP COLUMN IF EXISTS status_inspecao,
  DROP COLUMN IF EXISTS verificado_por,
  DROP COLUMN IF EXISTS verificado_em,
  DROP COLUMN IF EXISTS inspecionado_em,
  DROP COLUMN IF EXISTS lacre,
  DROP COLUMN IF EXISTS manometro,
  DROP COLUMN IF EXISTS sinalizacao_parede,
  DROP COLUMN IF EXISTS sinalizacao_piso,
  DROP COLUMN IF EXISTS suporte,
  DROP COLUMN IF EXISTS mangueira,
  DROP COLUMN IF EXISTS quadro_instrucao,
  DROP COLUMN IF EXISTS status_geral,
  DROP COLUMN IF EXISTS observacoes,
  DROP COLUMN IF EXISTS fotos,
  DROP COLUMN IF EXISTS inspetor;

DROP TABLE IF EXISTS ciclos;
DROP TABLE IF EXISTS regioes;
