-- Reverse 0037: remove the "sistema antigo" flag.
ALTER TABLE cronograma_alarme DROP COLUMN IF EXISTS sistema_antigo;
