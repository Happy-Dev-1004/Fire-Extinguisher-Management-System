-- Reverse 0036: drop the alarm preventive-maintenance visits table.
DROP TRIGGER IF EXISTS visitas_manut_set_updated_at ON visitas_manutencao_alarme;
DROP FUNCTION IF EXISTS visitas_manut_touch_updated_at();
DROP TABLE IF EXISTS visitas_manutencao_alarme;
