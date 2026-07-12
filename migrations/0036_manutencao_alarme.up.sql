-- =============================================================================
-- MIGRATION 0036: Fase 2 — Manutenção Preventiva do Alarme (visitas periódicas)
--
-- The MANSUR × Barry Callebaut contract is preventive+corrective maintenance of
-- the fire-alarm system: recurring visits (8/month), each following a 7-step
-- checklist, each producing a technical report. This mirrors the periodic-
-- inspection model of Fase 1 (extintores) / Fase 3 (hidrantes):
--   ciclo → visita com checklist → verificação → relatório PDF → envio.
--
-- Design (agreed): one VISIT covers ONE central. Each of the 7 checklist steps
-- (from the proposal's flowchart) is a 4-state value + observação:
--   OK | NC (não-conformidade) | N.A | "" (não preenchido).
-- =============================================================================

CREATE TABLE IF NOT EXISTS visitas_manutencao_alarme (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  central_id      UUID        NOT NULL REFERENCES centrais(id) ON DELETE CASCADE,
  data_visita     DATE,
  tecnicos        TEXT,                         -- nomes dos técnicos da visita
  responsavel     TEXT,                         -- responsável pelo relatório

  -- Checklist das 7 etapas (fluxograma da proposta). Cada uma: OK | NC | N.A | ''
  e1_planejamento     TEXT,   -- Planejamento da visita (acessos, permissões, PT)
  e2_preparacao       TEXT,   -- Chegada e preparação (check-in, registros)
  e3_inspecao_visual  TEXT,   -- Inspeção visual (equipamentos, não-conformidades)
  e4_testes           TEXT,   -- Testes funcionais (acionadores, detectores, sirenes, central)
  e5_verificacoes     TEXT,   -- Verificações técnicas (alimentação, baterias, comunicação)
  e6_ajustes          TEXT,   -- Ajustes e correções (reparos de pequena complexidade, limpeza)
  e7_relatorio        TEXT,   -- Relatório e encerramento (irregularidades, recomendações)

  -- Observação por etapa (JSONB: { "e3_inspecao_visual": "…", … })
  observacoes_etapas  JSONB   NOT NULL DEFAULT '{}'::jsonb,

  -- Fechamento da visita
  nao_conformidades   TEXT,   -- não-conformidades encontradas
  recomendacoes       TEXT,   -- recomendações de correção
  observacoes         TEXT,   -- observações gerais
  fotos               TEXT[]  NOT NULL DEFAULT '{}',

  -- Ciclo de vida (3 estados, como as inspeções das Fases 1/3):
  status              TEXT        NOT NULL DEFAULT 'rascunho'
                        CHECK (status IN ('rascunho','aguardando_verificacao','verificado')),
  verificado_por      UUID,
  verificado_em       TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitas_manut_central_idx ON visitas_manutencao_alarme (central_id);
CREATE INDEX IF NOT EXISTS visitas_manut_data_idx    ON visitas_manutencao_alarme (data_visita);
CREATE INDEX IF NOT EXISTS visitas_manut_status_idx  ON visitas_manutencao_alarme (status);

ALTER TABLE visitas_manutencao_alarme DISABLE ROW LEVEL SECURITY;

-- keep updated_at fresh on any change
CREATE OR REPLACE FUNCTION visitas_manut_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS visitas_manut_set_updated_at ON visitas_manutencao_alarme;
CREATE TRIGGER visitas_manut_set_updated_at
  BEFORE UPDATE ON visitas_manutencao_alarme
  FOR EACH ROW EXECUTE FUNCTION visitas_manut_touch_updated_at();
