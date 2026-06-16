-- Reverts Ilhéus 201-300 type/sector to blank.
UPDATE extintores SET tipo_carga='', setor='' WHERE regiao='Ilhéus' AND numero_int BETWEEN 201 AND 300;

