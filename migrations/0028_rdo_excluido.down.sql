-- Revert any soft-deleted rows to cancelado so they satisfy the narrower
-- constraint, then restore the original CHECK.
UPDATE rdos SET status = 'cancelado' WHERE status = 'excluido';
ALTER TABLE rdos DROP CONSTRAINT IF EXISTS rdos_status_check;
ALTER TABLE rdos
  ADD CONSTRAINT rdos_status_check
  CHECK (status IN ('em_andamento','concluido','cancelado'));
