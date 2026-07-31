-- =============================================================================
-- MIGRATION 0040: colunas de planejamento no cronograma do alarme
--
-- Pedido do cliente (reunião na Barry Callebaut): além da data de entrega que já
-- existe, a planilha precisa mostrar, por área:
--   • pct_area          — quanto aquela área representa da área TOTAL da fábrica.
--                         Ex.: a fábrica tem 40.000 m²; a linha de separação
--                         corresponde a 1,5% desse total. Concluída a área, esses
--                         1,5% entram no percentual atendido (soma no backend).
--   • data_inicio_prevista / data_entrega_prevista — planejamento
--   • data_inicio_real   / data_fim_real            — execução
--
-- A DURAÇÃO não é coluna: é calculada (entrega prevista − início previsto), para
-- não guardar valor derivado que possa divergir das datas.
--
-- data_prevista (que já existia) continua sendo a data de entrega oficial usada
-- no cálculo de atrasado/no prazo. data_entrega_prevista é preenchida a partir
-- dela na primeira execução, para o cliente não perder o que já digitou.
-- =============================================================================

ALTER TABLE cronograma_alarme
  ADD COLUMN IF NOT EXISTS pct_area              NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS data_inicio_prevista  DATE,
  ADD COLUMN IF NOT EXISTS data_entrega_prevista DATE,
  ADD COLUMN IF NOT EXISTS data_inicio_real      DATE,
  ADD COLUMN IF NOT EXISTS data_fim_real         DATE;

-- Percentual de área é sempre >= 0 (não limitamos a 100: a soma das áreas pode
-- passar de 100 por arredondamento, e travar isso atrapalharia o preenchimento).
ALTER TABLE cronograma_alarme DROP CONSTRAINT IF EXISTS cronograma_pct_area_check;
ALTER TABLE cronograma_alarme
  ADD CONSTRAINT cronograma_pct_area_check CHECK (pct_area IS NULL OR pct_area >= 0);

-- Semeia a entrega prevista com a data de entrega já cadastrada (só onde a nova
-- ainda está vazia, para não sobrescrever nada que o cliente já tenha digitado).
UPDATE cronograma_alarme
   SET data_entrega_prevista = data_prevista
 WHERE data_entrega_prevista IS NULL
   AND data_prevista IS NOT NULL;
