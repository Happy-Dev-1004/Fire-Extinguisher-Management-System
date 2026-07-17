-- =============================================================================
-- MIGRATION 0037: cronograma do alarme — coluna "sistema antigo" por área
--
-- O cliente quer marcar, por área (central + setor), se aquela área JÁ possui
-- equipamento instalado no SISTEMA ANTIGO (o que existia antes). É uma resposta
-- manual Sim/Não (informativa), independente do progresso da instalação nova.
--
-- BOOLEAN nullable: NULL = ainda não respondido; true = Sim; false = Não.
-- =============================================================================

ALTER TABLE cronograma_alarme
  ADD COLUMN IF NOT EXISTS sistema_antigo BOOLEAN;
