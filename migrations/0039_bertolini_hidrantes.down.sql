-- =============================================================================
-- MIGRATION 0039 (down): remove a unidade "Bertolini" da Fase 3
--
-- ATENÇÃO: apaga os 76 slots de hidrante da Bertolini e TUDO que já tenha sido
-- preenchido neles (constantes, checklist, fotos, inspeções). Só use se a
-- unidade tiver sido criada por engano.
-- =============================================================================

DELETE FROM hidrantes WHERE unidade = 'Bertolini';
DELETE FROM unidades_hidrante WHERE nome = 'Bertolini';
