-- =============================================================================
-- MIGRATION 0039: unidade "Bertolini" (Fase 3) com 76 hidrantes VAZIOS
--
-- Quinta unidade de hidrantes, ao lado de Fábrica Ilhéus / Fábrica Itabuna /
-- CW Ilhéus / CW Itabuna. O inventário real (setor, esguicho, mangueira,
-- chave storz de cada hidrante) ainda NÃO existe — o cliente vai preencher
-- depois, manualmente, pela tela (Hidrantes → Bertolini → editar cada slot).
--
-- Por isso criamos os 76 slots H01…H76 com as CONSTANTES em branco:
--   • numero / numero_int  → preenchidos (H01..H76, 1..76)
--   • setor/esguicho/mangueira/chave_storz → NULL/'' (a completar na tela)
--   • checklist e fotos    → vazios, status 'nao_inspecionado'
--
-- Nada aqui toca as 4 unidades existentes nem os hidrantes já cadastrados.
-- Idempotente: pode rodar quantas vezes quiser (não duplica slots).
-- =============================================================================

-- ── 1. cadastra a unidade ────────────────────────────────────────────────────
-- ON CONFLICT DO UPDATE (e não DO NOTHING) para que, se a unidade já existir
-- com contagem 0 de uma tentativa anterior, o total suba para 76.
INSERT INTO unidades_hidrante (nome, total_hidrantes, ordem) VALUES
  ('Bertolini', 76, 5)
ON CONFLICT (nome) DO UPDATE
  SET total_hidrantes = EXCLUDED.total_hidrantes,
      ordem           = EXCLUDED.ordem;

-- ── 2. gera os 76 slots vazios H01…H76 ───────────────────────────────────────
-- Mesmo formato de rótulo do seed_hidrantes() ('H' + 2 dígitos), para a tela e
-- o casamento por WhatsApp funcionarem igual às outras unidades.
-- setor = '' (string vazia, como o seed_hidrantes faz) e as demais constantes
-- ficam NULL — a tela mostra "—" e permite editar.
INSERT INTO hidrantes (numero, numero_int, unidade, setor, status_inspecao, fotos)
SELECT 'H' || lpad(gs::text, 2, '0'), gs, 'Bertolini', '', 'nao_inspecionado', '{}'::text[]
FROM generate_series(1, 76) AS gs
WHERE NOT EXISTS (
  SELECT 1 FROM hidrantes h WHERE h.unidade = 'Bertolini' AND h.numero_int = gs
);

-- ── 3. garante um ciclo de hidrantes ativo ───────────────────────────────────
-- Se a Fase 3 nunca teve ciclo aberto, abre um (mesma regra do seed_hidrantes).
INSERT INTO ciclos_hidrante (mes_referencia, status)
SELECT NULL, 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM ciclos_hidrante WHERE status = 'ativo');
