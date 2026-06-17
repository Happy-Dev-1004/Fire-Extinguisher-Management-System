-- =============================================================================
-- MIGRATION 0021: lotes_fotos.rotulado_em + numero (settle-window grouping)
--
-- Album photos arrive as separate webhook calls with no group id, and the
-- NUMBER message can arrive before the last photos. To group them correctly we
-- no longer finalise a batch the instant the number arrives — instead the number
-- LABELS the batch (stamping rotulado_em + numero) and a short debounce window
-- lets straggler photos still join before analysis.
--
-- rotulado_em: when the number was received (null = not labeled yet).
-- numero:      the extinguisher number the inspector sent for this batch.
-- A periodic sweep finalises any labeled batch whose settle window has elapsed,
-- which also recovers labeled batches across a server restart.
-- =============================================================================

ALTER TABLE lotes_fotos
  ADD COLUMN IF NOT EXISTS rotulado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS numero      TEXT;
