-- =============================================================================
-- MIGRATION 0034: seed the Fábrica Itabuna hydrant inventory
--
-- The 4th unit ("Fábrica Itabuna") was created empty in 0031/0032; this is its
-- documented inventory (client "Levantamento Hidrantes Fábrica de Itabuna"):
--   • 46 hydrants (H-01 .. H-46), all type "Duplo", each with a named setor.
--   • esguicho = 2, chave_storz = 4 for ALL (uniform).
--   • mangueira VARIES per hydrant: 4 or 8 (the "08 de 15m" rows get 8).
--     (Adaptador 2 and Tampão 2 are uniform but we don't track those columns.)
--
-- Same convention as 0032/0033: upsert by (unidade, numero_int), writing ONLY
-- the constants + setor + display number — checklist, lifecycle, photos and
-- inspection status are untouched, so this is safe to run after inspections
-- start. The active cycle is opened if none exists.
-- =============================================================================

-- ── unit total ───────────────────────────────────────────────────────────────
UPDATE unidades_hidrante SET total_hidrantes = 46, ordem = 2 WHERE nome = 'Fábrica Itabuna';
INSERT INTO unidades_hidrante (nome, total_hidrantes, ordem)
SELECT 'Fábrica Itabuna', 46, 2
WHERE NOT EXISTS (SELECT 1 FROM unidades_hidrante WHERE nome = 'Fábrica Itabuna');

-- ── upsert helper: constants/setor/numero only, never the checklist ──────────
CREATE OR REPLACE FUNCTION _seed_hidrante_it(
  p_numero_int INTEGER,
  p_setor      TEXT,
  p_mangueira  TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO hidrantes (
    numero, numero_int, unidade, setor,
    esguicho, mangueira, chave_storz,
    status_inspecao, fotos
  ) VALUES (
    'H' || lpad(p_numero_int::text, 2, '0'), p_numero_int, 'Fábrica Itabuna', p_setor,
    '2', p_mangueira, '4',
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

DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN
    SELECT * FROM (VALUES
      -- numero_int, setor, mangueira_count
      ( 1, 'Externo Caldeira',                                   '4'),
      ( 2, 'Externo Caldeira',                                   '4'),
      ( 3, 'Externo Caldeira',                                   '4'),
      ( 4, 'Externo Armazém de Favas',                           '8'),
      ( 5, 'Externo Torrefação Linha 3',                         '8'),
      ( 6, 'Externo Armazém de Produtos Terminados',            '8'),
      ( 7, 'Externo Armazém de Produtos Terminados',            '8'),
      ( 8, 'Moagem 2',                                           '4'),
      ( 9, 'Pulverização Linha 2',                               '4'),
      (10, 'Paletização Armazém de Produtos Terminados',        '4'),
      (11, 'Armazém de Produtos Terminados',                    '4'),
      (12, 'Paletização Armazém de Produtos Terminados',        '4'),
      (13, 'Externo Armazém de Favas',                           '8'),
      (14, 'Externo Separação de Cascas',                        '8'),
      (15, 'Externo Área de Prensa 2',                           '8'),
      (16, 'Externo Almoxarifado',                               '8'),
      (17, 'Externo Paletização de Produtos Terminados',        '8'),
      (18, 'Externo ADM',                                        '8'),
      (19, 'Externo Casa de Bombas',                             '8'),
      (20, 'Externo Escritório Técnico-Oficina',                 '8'),
      (21, 'Externo Ampliação Galpão de logística – Fase 2',     '8'),
      (22, 'Externo Ampliação Galpão de logística – Fase 2',     '8'),
      (23, 'Externo Ampliação Galpão de logística – Fase 2',     '8'),
      (24, 'Ampliação Galpão de logística – Fase 2',             '4'),
      (25, 'Ampliação Galpão de logística – Fase 2',             '4'),
      (26, 'Ampliação Galpão de logística – Fase 2',             '4'),
      (27, 'Ampliação Galpão de logística – Fase 2',             '4'),
      (28, 'Ampliação Galpão de logística – Fase 2',             '4'),
      (29, 'Armazém Logística 1 (Lateral do Armazém de Paletes)','4'),
      (30, 'Armazém Logística 2 (Lateral Área Externa)',         '4'),
      (31, 'Armazém Logística 1 (Lateral do Armazém de Paletes)','4'),
      (32, 'Armazém Logística 2 (Lateral Área Externa)',         '4'),
      (33, 'Ampliação Galpão Logística Fase 1 (Próximo a Docas)','4'),
      (34, 'Ampliação Galpão Logística Fase 1 (Próximo a Docas)','4'),
      (35, 'Ampliação Galpão Logística Fase 1 (Próximo a Docas)','4'),
      (36, 'Ampliação Galpão Logística Fase 1 (Próximo a Docas)','4'),
      (37, 'Doca Logística',                                      '4'),
      (38, 'Doca Logística',                                      '4'),
      (39, 'Externo Doca Logística',                             '4'),
      (40, 'Externo Doca Logística',                             '4'),
      (41, 'Externo Lavanderia',                                 '8'),
      (42, 'Corredor Circulação Logística',                      '4'),
      (43, 'Corredor Circulação Logística',                      '4'),
      (44, 'Externo armazém de Paletes',                         '8'),
      (45, 'Externo Galpão Próximo a Pista',                     '8'),
      (46, 'Externo Sala de Treinamentos-Salas Gerências',       '8')
    ) AS t(n, setor, mangueira)
  LOOP
    PERFORM _seed_hidrante_it(v.n, v.setor, v.mangueira);
  END LOOP;
END $$;

-- open the first cycle if none is active (mirrors seed_hidrantes)
INSERT INTO ciclos_hidrante (mes_referencia, status)
SELECT NULL, 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM ciclos_hidrante WHERE status = 'ativo');

DROP FUNCTION _seed_hidrante_it(INTEGER, TEXT, TEXT);
