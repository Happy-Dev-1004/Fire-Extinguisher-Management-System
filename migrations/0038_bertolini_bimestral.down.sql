-- Reverse 0038: remove Bertolini, seus ciclos e as colunas adicionadas.
DELETE FROM extintores WHERE regiao = 'Bertolini';
DELETE FROM ciclos     WHERE regiao = 'Bertolini';
DELETE FROM regioes    WHERE nome   = 'Bertolini';

-- Restaura o índice de "um único ciclo ativo global".
DROP INDEX IF EXISTS ciclos_um_ativo_por_regiao;
CREATE UNIQUE INDEX IF NOT EXISTS ciclos_um_ativo ON ciclos (status) WHERE status = 'ativo';

ALTER TABLE ciclos  DROP COLUMN IF EXISTS regiao;
ALTER TABLE regioes DROP COLUMN IF EXISTS periodicidade;
