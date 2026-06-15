-- Reverts Barry Itabuna 192-276 type/sector to blank.
UPDATE extintores SET tipo_carga='', setor='' WHERE regiao='Barry Itabuna' AND numero_int BETWEEN 192 AND 276;

