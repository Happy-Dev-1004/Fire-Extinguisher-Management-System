-- =============================================================================
-- MIGRATION 0028: allow soft-deleting RDOs
--
-- RDOs are soft-deleted (status='excluido') so history/audit is preserved,
-- consistent with how inspectors/devices are deactivated rather than removed.
-- The 0024 CHECK constraint only allowed em_andamento/concluido/cancelado, so we
-- widen it to include 'excluido'.
-- =============================================================================

ALTER TABLE rdos DROP CONSTRAINT IF EXISTS rdos_status_check;
ALTER TABLE rdos
  ADD CONSTRAINT rdos_status_check
  CHECK (status IN ('em_andamento','concluido','cancelado','excluido'));
