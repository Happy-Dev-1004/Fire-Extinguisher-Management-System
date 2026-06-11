-- =============================================================================
-- MIGRATION 0007: indexes for /busca performance
--
-- The search endpoint joins extintores + inspecoes with multiple combinable
-- filters. These indexes cover the most common filter columns.
-- =============================================================================

-- extintores: unidade, setor, numero partial-match, tipo_carga
CREATE INDEX IF NOT EXISTS extintores_unidade_idx   ON extintores (unidade);
CREATE INDEX IF NOT EXISTS extintores_numero_idx    ON extintores (numero);
CREATE INDEX IF NOT EXISTS extintores_setor_idx     ON extintores (setor);
CREATE INDEX IF NOT EXISTS extintores_status_ativo_idx ON extintores (status_ativo);

-- inspecoes: join key, mes_referencia, inspetor, status_geral, irregularidade
CREATE INDEX IF NOT EXISTS inspecoes_extintor_idx   ON inspecoes (extintor_numero, extintor_unidade);
CREATE INDEX IF NOT EXISTS inspecoes_mes_idx        ON inspecoes (mes_referencia);
CREATE INDEX IF NOT EXISTS inspecoes_inspetor_idx   ON inspecoes (inspetor);
CREATE INDEX IF NOT EXISTS inspecoes_status_geral_idx ON inspecoes (status_geral);
CREATE INDEX IF NOT EXISTS inspecoes_irregularidade_idx ON inspecoes (tem_irregularidade);
CREATE INDEX IF NOT EXISTS inspecoes_data_idx       ON inspecoes (data_inspecao DESC);
