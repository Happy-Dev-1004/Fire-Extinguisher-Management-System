-- Reverse 0031: remove the 4 seeded units (only if still empty / no slots created).
-- Hydrants referencing a unit by name would be orphaned, so only delete units
-- that have no hydrant slots yet.
DELETE FROM unidades_hidrante u
 WHERE u.nome IN ('Fábrica Ilhéus', 'Fábrica Itabuna', 'CW Ilhéus', 'CW Itabuna')
   AND NOT EXISTS (SELECT 1 FROM hidrantes h WHERE h.unidade = u.nome);
