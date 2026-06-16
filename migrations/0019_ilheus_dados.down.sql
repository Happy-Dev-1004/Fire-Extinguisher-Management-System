-- Reverts Ilhéus 1-200 type/sector to blank.
UPDATE extintores SET tipo_carga='', setor='' WHERE regiao='Ilhéus' AND numero_int BETWEEN 1 AND 200;

