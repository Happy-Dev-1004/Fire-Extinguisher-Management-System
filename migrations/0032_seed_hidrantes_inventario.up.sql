-- =============================================================================
-- MIGRATION 0032: seed the real hydrant inventory (client documentation)
--
-- Fills the 3 documented units with their hydrant slots, the per-hydrant
-- CONSTANTS (4 mangueiras, 2 esguichos, 2 chaves storz — same for all units),
-- and the sector labels where provided:
--
--   • Fábrica Ilhéus — 43 hydrants (H01..H43), each with a named setor.
--   • CW Itabuna     — 12 hydrants (H01..H12), no setor labels yet.
--   • CW Ilhéus      — 20 hydrants. The printed numbering is H01..H10 then
--                      H11-1/H11-2 … H15-2 (positions 11..15 each have two).
--                      Stored as 20 sequential slots (numero_int 1..20) so the
--                      slot model stays unique, while `numero` keeps the printed
--                      label the inspector sees.
--
-- Idempotent + non-destructive: each hydrant is upserted by (unidade, numero_int)
-- and ONLY the constants / setor / display-number are written — the checklist
-- columns and inspection lifecycle are never touched, so re-running this after
-- inspections have begun does not wipe any data. The active cycle is opened if
-- none exists (mirrors seed_hidrantes()).
-- =============================================================================

-- ── 0. unit totals ───────────────────────────────────────────────────────────
INSERT INTO unidades_hidrante (nome, total_hidrantes, ordem) VALUES
  ('Fábrica Ilhéus',  43, 1),
  ('Fábrica Itabuna',  0, 2),
  ('CW Ilhéus',       20, 3),
  ('CW Itabuna',      12, 4)
ON CONFLICT (nome) DO UPDATE
  SET total_hidrantes = EXCLUDED.total_hidrantes,
      ordem           = EXCLUDED.ordem;

-- ── upsert helper: writes constants/setor/numero without touching checklist ──
-- (constants are the same across all units)
CREATE OR REPLACE FUNCTION _seed_hidrante(
  p_unidade    TEXT,
  p_numero_int INTEGER,
  p_numero     TEXT,
  p_setor      TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO hidrantes (
    numero, numero_int, unidade, setor,
    esguicho, mangueira, chave_storz,
    status_inspecao, fotos
  ) VALUES (
    p_numero, p_numero_int, p_unidade, p_setor,
    '2', '4', '2',
    'nao_inspecionado', '{}'::text[]
  )
  ON CONFLICT (unidade, numero_int) DO UPDATE SET
    numero      = EXCLUDED.numero,
    setor       = EXCLUDED.setor,
    esguicho    = EXCLUDED.esguicho,
    mangueira   = EXCLUDED.mangueira,
    chave_storz = EXCLUDED.chave_storz;
    -- checklist columns / status_inspecao deliberately NOT updated.
END;
$$;

-- ── 1. Fábrica Ilhéus — 43 hydrants with named sectors ───────────────────────
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ( 1, 'Entrada Fábrica'),
      ( 2, 'Perto área descanso'),
      ( 3, 'Área externa perto silos'),
      ( 4, 'Área externa fundo ADM'),
      ( 5, 'Área externa fundo ADM'),
      ( 6, 'Área externa perto área vermelha'),
      ( 7, 'Área Vermelha'),
      ( 8, 'Área externa caldeira'),
      ( 9, 'Área externa perto caldeira'),
      (10, 'Próximo torre resfriamento'),
      (11, 'Perto Porta Sanitização'),
      (12, 'Perto entrada Downstream'),
      (13, 'Área externa perto brigada'),
      (14, 'Próximo Produto Químico'),
      (15, 'Área externa perto oficina'),
      (16, 'Área externa próximo auditório'),
      (17, 'Área externa perto 2S'),
      (18, 'Área externa próximo reciclagem'),
      (19, 'Área externa próximo garagem'),
      (20, 'Área externa próximo garagem'),
      (21, 'Área externa perto refeitório'),
      (22, 'Armazém Embalagem'),
      (23, 'Armazém produto acabado'),
      (24, 'Produto acabado'),
      (25, 'Produto acabado'),
      (26, 'Produto acabado'),
      (27, 'Produto acabado'),
      (28, 'Produto acabado'),
      (29, 'Produto acabado'),
      (30, 'Produto para embarque'),
      (31, 'Docas'),
      (32, 'Robozinho'),
      (33, 'Robozinho'),
      (34, 'Armazém intermediário'),
      (35, 'Armazém intermediário'),
      (36, 'Armazém intermediário'),
      (37, 'Área de Pó'),
      (38, 'Moega'),
      (39, 'Moega'),
      (40, 'Área Branca'),
      (41, 'Área Branca'),
      (42, 'Área Branca'),
      (43, 'Área Vermelha')
    ) AS t(n, setor)
  LOOP
    PERFORM _seed_hidrante(
      'Fábrica Ilhéus', v.n, 'H' || lpad(v.n::text, 2, '0'), v.setor
    );
  END LOOP;
END $$;

-- ── 2. CW Itabuna — 12 hydrants (no setor labels yet) ────────────────────────
DO $$
DECLARE i INTEGER;
BEGIN
  FOR i IN 1..12 LOOP
    PERFORM _seed_hidrante('CW Itabuna', i, 'H' || lpad(i::text, 2, '0'), '');
  END LOOP;
END $$;

-- ── 3. CW Ilhéus — 20 slots, printed numbering preserved in `numero` ─────────
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      ( 1, 'H01'),
      ( 2, 'H02'),
      ( 3, 'H03'),
      ( 4, 'H04'),
      ( 5, 'H05'),
      ( 6, 'H06'),
      ( 7, 'H07'),
      ( 8, 'H08'),
      ( 9, 'H09'),
      (10, 'H10'),
      (11, 'H11-1'),
      (12, 'H11-2'),
      (13, 'H12-1'),
      (14, 'H12-2'),
      (15, 'H13-1'),
      (16, 'H13-2'),
      (17, 'H14-1'),
      (18, 'H14-2'),
      (19, 'H15-1'),
      (20, 'H15-2')
    ) AS t(n, rotulo)
  LOOP
    PERFORM _seed_hidrante('CW Ilhéus', v.n, v.rotulo, '');
  END LOOP;
END $$;

-- ── 4. open the first cycle if none is active (mirrors seed_hidrantes) ────────
INSERT INTO ciclos_hidrante (mes_referencia, status)
SELECT NULL, 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM ciclos_hidrante WHERE status = 'ativo');

-- helper is single-use; drop it so it doesn't linger in the schema.
DROP FUNCTION _seed_hidrante(TEXT, INTEGER, TEXT, TEXT);
