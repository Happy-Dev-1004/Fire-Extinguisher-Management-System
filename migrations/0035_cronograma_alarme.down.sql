-- Reverse 0035: drop the alarm execution-schedule table.
DROP TRIGGER IF EXISTS cronograma_alarme_set_updated_at ON cronograma_alarme;
DROP FUNCTION IF EXISTS cronograma_alarme_touch_updated_at();
DROP TABLE IF EXISTS cronograma_alarme;
