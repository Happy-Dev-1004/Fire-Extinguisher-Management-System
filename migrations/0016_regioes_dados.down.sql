-- Reverts type/sector to blank for the four regions seeded in 0016.
UPDATE extintores SET tipo_carga='', setor='' WHERE regiao IN ('Viveiro Itabuna','Viveiro Ilhéus','CW Ilhéus','CW Itabuna');

