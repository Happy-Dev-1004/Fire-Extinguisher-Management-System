-- =============================================================================
-- MIGRATION 0033: correct CW Ilhéus per-hydrant constants
--
-- 0032 seeded every hydrant with the uniform constants (mangueira 4, esguicho 2,
-- chave_storz 2). CW Ilhéus actually varies per hydrant, per the client's list:
--
--   H01..H10  → 4 mangueiras, 2 esguichos, chaves vary (see below)
--   H11-1..H15-2 (numero_int 11..20) → 2 mangueiras, 1 esguicho, 2 chaves
--
-- chaves for H01..H10: H01=4 H02=2 H03=2 H04=4 H05=2 H06=4 H07=2 H08=2 H09=4 H10=4
--
-- Updates ONLY the three constant columns, keyed by (unidade, numero_int) — the
-- checklist, lifecycle, photos and setor are untouched, so this is safe to run
-- after inspections have started. Idempotent (UPDATE to fixed values).
-- =============================================================================

DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      -- numero_int, mangueira, esguicho, chave_storz
      ( 1, '4', '2', '4'),
      ( 2, '4', '2', '2'),
      ( 3, '4', '2', '2'),
      ( 4, '4', '2', '4'),
      ( 5, '4', '2', '2'),
      ( 6, '4', '2', '4'),
      ( 7, '4', '2', '2'),
      ( 8, '4', '2', '2'),
      ( 9, '4', '2', '4'),
      (10, '4', '2', '4'),
      (11, '2', '1', '2'),  -- H11-1
      (12, '2', '1', '2'),  -- H11-2
      (13, '2', '1', '2'),  -- H12-1
      (14, '2', '1', '2'),  -- H12-2
      (15, '2', '1', '2'),  -- H13-1
      (16, '2', '1', '2'),  -- H13-2
      (17, '2', '1', '2'),  -- H14-1
      (18, '2', '1', '2'),  -- H14-2
      (19, '2', '1', '2'),  -- H15-1
      (20, '2', '1', '2')   -- H15-2
    ) AS t(n, mangueira, esguicho, chave_storz)
  LOOP
    UPDATE hidrantes
       SET mangueira   = v.mangueira,
           esguicho    = v.esguicho,
           chave_storz = v.chave_storz
     WHERE unidade = 'CW Ilhéus' AND numero_int = v.n;
  END LOOP;
END $$;
