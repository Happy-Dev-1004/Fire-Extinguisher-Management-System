-- Reverse 0034: remove the Fábrica Itabuna hydrant slots and reset its total to
-- 0. Safe only before inspections matter — deletes the hydrant rows (and any
-- inspection data on them).
DELETE FROM hidrantes WHERE unidade = 'Fábrica Itabuna';
UPDATE unidades_hidrante SET total_hidrantes = 0 WHERE nome = 'Fábrica Itabuna';
