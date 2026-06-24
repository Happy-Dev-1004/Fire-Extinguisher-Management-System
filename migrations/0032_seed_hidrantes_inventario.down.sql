-- Reverse 0032: remove the seeded hydrant slots for the 3 documented units and
-- reset their totals to 0. Safe to run only before inspections matter — this
-- deletes the hydrant rows (and any inspection data on them).
DELETE FROM hidrantes WHERE unidade IN ('Fábrica Ilhéus', 'CW Itabuna', 'CW Ilhéus');

UPDATE unidades_hidrante
   SET total_hidrantes = 0
 WHERE nome IN ('Fábrica Ilhéus', 'CW Itabuna', 'CW Ilhéus');

-- (helper function _seed_hidrante is dropped at the end of the up migration.)
