-- =============================================================================
-- MIGRATION 0038: local "Bertolini" (Fase 1) com ciclo TRIMESTRAL
--
-- Nova região de extintores com relatório TRIMESTRAL (as demais seguem mensais).
-- Design de menor risco: a periodicidade é por REGIÃO, e o ciclo ganha uma coluna
-- 'regiao' NULLABLE — regiao IS NULL = o ciclo global mensal atual (as regiões já
-- existentes, sem mudança nenhuma); regiao = 'Bertolini' = ciclo próprio trimestral.
--
-- Seed: 122 extintores da lista do cliente (setor + tipo/carga). Faltam os nº
-- 118/119/124 (não existem) e o nº16 vem sem tipo (a completar na tela — edição
-- manual, igual à Fase 1). Idempotente: não recria slots já existentes.
-- =============================================================================

-- ── 1. periodicidade por região ──────────────────────────────────────────────
ALTER TABLE regioes
  ADD COLUMN IF NOT EXISTS periodicidade TEXT NOT NULL DEFAULT 'mensal'
    CHECK (periodicidade IN ('mensal','trimestral'));

-- ── 2. ciclo por região (NULL = ciclo global mensal existente) ───────────────
ALTER TABLE ciclos
  ADD COLUMN IF NOT EXISTS regiao TEXT;

-- Troca o "um único ciclo ativo global" por "um ciclo ativo por regiao"
-- (o ciclo global das outras regiões usa regiao IS NULL). COALESCE colapsa o NULL
-- num sentinela para o índice tratar "global" como uma chave única também.
DROP INDEX IF EXISTS ciclos_um_ativo;
CREATE UNIQUE INDEX IF NOT EXISTS ciclos_um_ativo_por_regiao
  ON ciclos (COALESCE(regiao, '__global__'))
  WHERE status = 'ativo';

-- ── 3. cadastra a região Bertolini (trimestral) ──────────────────────────────
-- total_extintores = 125 (maior número da lista) para os slots baterem com a
-- numeração real; os nº 118/119/124 ficam como slots vazios (podem ser removidos
-- ou preenchidos na tela).
INSERT INTO regioes (nome, total_extintores, ordem, periodicidade) VALUES
  ('Bertolini', 125, 7, 'trimestral')
ON CONFLICT (nome) DO UPDATE
  SET total_extintores = EXCLUDED.total_extintores,
      ordem            = EXCLUDED.ordem,
      periodicidade    = EXCLUDED.periodicidade;

-- ── 4. seed dos 122 extintores (setor + tipo/carga) ──────────────────────────
-- Upsert por (regiao, numero_int): grava setor/tipo_carga sem tocar em inspeção.
INSERT INTO extintores (numero, numero_int, regiao, unidade, setor, tipo_carga, status_inspecao, fotos)
SELECT v.numero, v.numero_int, 'Bertolini', 'Bertolini', v.setor, v.tipo_carga, 'nao_inspecionado', '{}'::text[]
FROM (VALUES
  (1, '1', 'Setor Fiscal', 'BC 06kg'),
  (2, '2', 'Sala de espera', 'AP 10LT'),
  (3, '3', 'Casa de Força geral', 'BC 12kg'),
  (4, '4', 'ADM Logber', 'BC 06kg'),
  (5, '5', 'Recepção', 'BC 06kg'),
  (6, '6', 'Copa', 'ABC 06kg'),
  (7, '7', 'Auditório', 'BC 12kg'),
  (8, '8', 'Recepção Ambulatório', 'AP 10LT'),
  (9, '9', 'Refeitório', 'AP 10LT'),
  (10, '10', 'Refeitório', 'AP 10LT'),
  (11, '11', 'Refeitório', 'AP 10LT'),
  (12, '12', 'Vestiário masculino', 'BC 06kg'),
  (13, '13', 'Entrada Estoque REF.', 'AP 10LT'),
  (14, '14', 'PRÓX. Entrada almoxarifado', 'AP 10LT'),
  (15, '15', 'Próx. Entrada almoxarifado', 'BC 06kg'),
  (16, '16', 'Almoxarifado Próx. Cafeteria', ''),
  (17, '17', 'Logber BMA HP 46', 'AP 10LT'),
  (18, '18', 'Logber BMA HP 46', 'BC 06kg'),
  (19, '19', 'Embalagem HP 47', 'BC 06kg'),
  (20, '20', 'Embalagem HP 48', 'CO2 06kg'),
  (21, '21', 'Embalagem após HP 49', 'BC 06kg'),
  (22, '22', 'Entrada Sala Obeya', 'ABC 06kg'),
  (23, '23', 'Mezanino', 'ABC 06kg'),
  (24, '24', 'Fundos Pintura Próx. HP 41', 'BC 12kg'),
  (25, '25', 'Fundos Pintura Próx. HP 41', 'AP 10LT'),
  (26, '26', 'Fundos Pintura Próx. HP 43', 'AP 10LT'),
  (27, '27', 'Fundos Pintura Próx. HP 43', 'AP 10LT'),
  (28, '28', 'Fundos Pintura Próx. HP 43', 'AP 10LT'),
  (29, '29', 'Fundos Pintura Próx HP 43', 'BC 12kg'),
  (30, '30', 'Abastecimento pintura HP 43', 'BC 06kg'),
  (31, '31', 'Abastecimento Pintura HP 32', 'CO2 06kg'),
  (32, '32', 'Desabastecimento Pintura HP 51', 'BC 06kg'),
  (33, '33', 'Desabastecimento Pintura HP 50', 'CO2 06kg'),
  (34, '34', 'Manutenção', 'BC 12kg'),
  (35, '35', 'Transformação Próx. HP 54', 'CO2 06kg'),
  (36, '36', 'Próximo HP 56', 'BC 12kg'),
  (37, '37', 'Transformação Próx. Jundiaí', 'CO2 06kg'),
  (38, '38', 'Transformação Próx. Jundiaí', 'AP 10LT'),
  (39, '39', 'Transformação Próx. Jundiaí', 'BC 06kg'),
  (40, '40', 'Separação e Informação HP 57', 'CO2 06kg'),
  (41, '41', 'Separação e Informação HP 59', 'CO2 06kg'),
  (42, '42', 'Estoque Próx. HP 69', 'BC 06kg'),
  (43, '43', 'Estoque Próx HP 69', 'CO2 06kg'),
  (44, '44', 'Expedição Próx. HP 60', 'BC 06kg'),
  (45, '45', 'Expedição Próx. HP 68', 'BC 08kg'),
  (46, '46', 'Expedição Próx. HP 68', 'AP 10LT'),
  (47, '47', 'Expedição Próx. HP 68', 'CO2 06kg'),
  (48, '48', 'Expedição Próx. HP 66', 'CO2 06kg'),
  (49, '49', 'Expedição Próx. HP 66', 'AP 10LT'),
  (50, '50', 'Expedição Próx. HP 66', 'BC 06kg'),
  (51, '51', 'Expedição Próx. HP 62', 'BC 06kg'),
  (52, '52', 'Expedição Próx. HP 64', 'BC 06kg'),
  (53, '53', 'Expedição Próx HP 64', 'AP 10LT'),
  (54, '54', 'Tampos Portão entrada', 'AP 10LT'),
  (55, '55', 'Tampos Portão entrada', 'BC 06kg'),
  (56, '56', 'Tampos Próximo serra kit', 'BC 06kg'),
  (57, '57', 'Tampos Próximo mesa ADM', 'BC 06kg'),
  (58, '58', 'Tampos Próximo estoque meio', 'BC 06kg'),
  (59, '59', 'Tampos fundos máquina seccionadora', 'CO2 06kg'),
  (60, '60', 'Tampos Próximo painel elétrico', 'CO2 06kg'),
  (61, '61', 'Tampos - Próximo bebedouro', 'BC 06kg'),
  (62, '62', 'Tampos - Próximo bebedouro', 'AP 10LT'),
  (63, '63', 'Casa de Bombas', 'CO2 06kg'),
  (64, '64', 'Utilidades BM', 'CO2 06kg'),
  (65, '65', 'Utilidades BM', 'BC 06kg'),
  (66, '66', 'Substação BMA', 'CO2 06kg'),
  (67, '67', 'Coleta Seletiva', 'BC 06kg'),
  (68, '68', 'Serralheria', 'CO2 06kg'),
  (69, '69', 'Substação 01 BMA Externo', 'CO2 06kg'),
  (70, '70', 'Substação 01 Interno', 'CO2 06kg'),
  (71, '71', 'Exaustor da Solda - externo', 'CO2 06kg'),
  (72, '72', 'Substação 02 - Interno', 'CO2 06kg'),
  (73, '73', 'Substação 02- interno', 'BC 50kg'),
  (74, '74', 'Manutenção matrizaria', 'BC 12kg'),
  (75, '75', 'Tanque de Argônio', 'CO2 06kg'),
  (76, '76', 'Expedição BSA - Externo', 'CO2 06kg'),
  (77, '77', 'Abastecimento de gás', 'BC 06kg'),
  (78, '78', 'Abastecimento de gás', 'BC 06kg'),
  (79, '79', 'Abastecimento de gás', 'BC 50kg'),
  (80, '80', 'Banheiro Almoxarifado', 'BC 06kg'),
  (81, '81', 'Mezanino almoxarifado', 'BC 06kg'),
  (82, '82', 'Armazém expedição meio', 'CO2 06kg'),
  (83, '83', 'Em frente drive in - meio', 'BC 06kg'),
  (84, '84', 'Próximo carregamento expedição', 'BC 06kg'),
  (85, '85', 'Descarga da Pintura', 'BC 06kg'),
  (86, '86', 'Carga da Pintura', 'BC 06kg'),
  (87, '87', 'Usinagem', 'CO2 06kg'),
  (88, '88', 'Matrizaria', 'AP 10LT'),
  (89, '89', 'Matrizaria', 'BC 06kg'),
  (90, '90', 'Posto de controle logístico', 'CO2 06kg'),
  (91, '91', 'Manutenção industrial', 'CO2 06kg'),
  (92, '92', 'Linha de longarina', 'ABC 06kg'),
  (93, '93', 'Descarga de bobinas', 'BC 06kg'),
  (94, '94', 'entre porta palets de Blanks', 'CO2 06kg'),
  (95, '95', 'Corte de Tubos', 'BC 06kg'),
  (96, '96', 'Box 1', 'CO2 06kg'),
  (97, '97', 'Robô de Solda Powermig', 'CO2 06kg'),
  (98, '98', 'Entrada Sala engenharia', 'CO2 06kg'),
  (99, '99', 'Sala engenharia', 'ABC 06kg'),
  (100, '100', 'Sala Manutenção', 'ABC 06kg'),
  (101, '101', 'Próx. Alimentador Máquina Fiorentini', 'CO2 06kg'),
  (102, '102', 'Próximo máquina Gasparini 3 metros', 'BC 06kg'),
  (103, '103', 'Próximo máquina Sliter', 'CO2 06kg'),
  (104, '104', 'Próximo máquina Sliter', 'BC 06kg'),
  (105, '105', 'Próximo portão 06', 'CO2 06kg'),
  (106, '106', 'Robô de Solda Dalca', 'BC 20kg'),
  (107, '107', 'Robô de Solda Dalca', 'CO2 06kg'),
  (108, '108', 'Robô de Solda Dalca', 'BC 06kg'),
  (109, '109', 'Próximo estufa de secagem de tinta', 'CO2 06kg'),
  (110, '110', 'Próximo cabine de pintura', 'BC 12kg'),
  (111, '111', 'próximo cabine de pintura', 'AP 10LT'),
  (112, '112', 'Próxima cabine de pintura', 'CO2 06kg'),
  (113, '113', 'Próximo tanque enxague 03', 'BC 06kg'),
  (114, '114', 'Substação Guarita entrada - interno', 'CO2 06kg'),
  (115, '115', 'Lado matrizaria', 'BC 06kg'),
  (116, '116', 'Tampos Lado quadro elétrico', 'CO2 06kg'),
  (117, '117', 'Tampos Lado quadro elétrico', 'AP 10LT'),
  (120, '120', 'Drive in Robô solda', 'BC 06kg'),
  (121, '121', 'Drive in Robô Solda', 'AP 10LT'),
  (122, '122', 'Próximo Gasparini 5 metros', 'CO2 06kg'),
  (123, '123', 'Banheiro Almoxarifado BSA', 'AP 10LT'),
  (125, '125', 'manutenção industrial', 'CO2 06kg')
) AS v(numero_int, numero, setor, tipo_carga)
ON CONFLICT (regiao, numero_int) DO UPDATE
  SET setor = EXCLUDED.setor, tipo_carga = EXCLUDED.tipo_carga;

-- ── 5. abre o primeiro ciclo trimestral do Bertolini (se ainda não houver) ────
INSERT INTO ciclos (mes_referencia, status, regiao)
SELECT 'Trimestre atual', 'ativo', 'Bertolini'
WHERE NOT EXISTS (SELECT 1 FROM ciclos WHERE regiao = 'Bertolini' AND status = 'ativo');

-- ── 6. RPC iniciar_novo_ciclo com região OPCIONAL ─────────────────────────────
-- p_regiao NULL  → comportamento antigo: arquiva o ciclo GLOBAL (regiao IS NULL)
--                  e reseta as regiões que NÃO têm ciclo próprio.
-- p_regiao dada  → arquiva só o ciclo daquela região e reseta só os extintores
--                  dela — usado pelo Bertolini (trimestral) e por qualquer
--                  região com ciclo próprio.
-- A assinatura antiga (p_mes, p_by) continua válida (p_regiao tem default NULL),
-- então nada que já chama a função quebra.
CREATE OR REPLACE FUNCTION iniciar_novo_ciclo(p_mes TEXT, p_by UUID, p_regiao TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  novo_id UUID;
BEGIN
  IF p_regiao IS NULL THEN
    -- Ciclo GLOBAL: arquiva o global e reseta as regiões sem ciclo próprio.
    UPDATE ciclos SET status = 'arquivado', arquivado_em = now()
     WHERE status = 'ativo' AND regiao IS NULL;

    UPDATE extintores e
       SET status_inspecao='nao_inspecionado', verificado_por=NULL, verificado_em=NULL,
           inspecionado_em=NULL, inspetor=NULL, vencimento_carga=NULL, vencimento_teste=NULL,
           lacre=NULL, manometro=NULL, sinalizacao_parede=NULL, sinalizacao_piso=NULL,
           suporte=NULL, mangueira=NULL, quadro_instrucao=NULL, status_geral=NULL,
           observacoes=NULL, fotos='{}'::text[]
     WHERE e.regiao IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM regioes r WHERE r.nome = e.regiao AND r.periodicidade <> 'mensal');

    INSERT INTO ciclos (mes_referencia, status, iniciado_por, regiao)
    VALUES (p_mes, 'ativo', p_by, NULL) RETURNING id INTO novo_id;
  ELSE
    -- Ciclo de UMA região (ex.: Bertolini trimestral).
    UPDATE ciclos SET status = 'arquivado', arquivado_em = now()
     WHERE status = 'ativo' AND regiao = p_regiao;

    UPDATE extintores
       SET status_inspecao='nao_inspecionado', verificado_por=NULL, verificado_em=NULL,
           inspecionado_em=NULL, inspetor=NULL, vencimento_carga=NULL, vencimento_teste=NULL,
           lacre=NULL, manometro=NULL, sinalizacao_parede=NULL, sinalizacao_piso=NULL,
           suporte=NULL, mangueira=NULL, quadro_instrucao=NULL, status_geral=NULL,
           observacoes=NULL, fotos='{}'::text[]
     WHERE regiao = p_regiao;

    INSERT INTO ciclos (mes_referencia, status, iniciado_por, regiao)
    VALUES (p_mes, 'ativo', p_by, p_regiao) RETURNING id INTO novo_id;
  END IF;

  RETURN novo_id;
END;
$$;
