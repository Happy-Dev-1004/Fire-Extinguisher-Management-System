-- Reverse 0034: remove the CSV-seeded alarm devices (identified by seed_key
-- prefix 'csv|'). Manually-created devices (seed_key NULL) are untouched.
-- The data_prevista_instalacao column is kept (harmless; used by the schedule
-- feature) — drop it explicitly only if you truly need to revert the schema.
DELETE FROM dispositivos_alarme WHERE seed_key LIKE 'csv|%';

-- To also revert the schema column, uncomment:
-- ALTER TABLE dispositivos_alarme DROP COLUMN IF EXISTS data_prevista_instalacao;
