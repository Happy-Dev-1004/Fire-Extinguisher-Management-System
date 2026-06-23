-- =============================================================================
-- MIGRATION 0031: seed the 4 Phase-3 hydrant units (by location)
--
-- Phase 3 has 4 fixed locations (vs Phase 1's 6 regions):
--   Fábrica Ilhéus, Fábrica Itabuna, CW Ilhéus, CW Itabuna
--
-- The hydrant COUNT per unit is not finalised yet, so each is seeded with
-- total_hidrantes = 0. The owner sets the real count later in the UI
-- (Hidrantes → Unidades), then runs "Gerar inventário" (seed_hidrantes) to
-- create the H01… slots. Idempotent: ON CONFLICT (nome) leaves existing rows
-- (and any count the owner already set) untouched.
-- =============================================================================

INSERT INTO unidades_hidrante (nome, total_hidrantes, ordem) VALUES
  ('Fábrica Ilhéus',  0, 1),
  ('Fábrica Itabuna', 0, 2),
  ('CW Ilhéus',       0, 3),
  ('CW Itabuna',      0, 4)
ON CONFLICT (nome) DO NOTHING;
