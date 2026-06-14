-- =============================================================================
-- MIGRATION 0010: atomic photo append to lotes_fotos
--
-- The webhook appended photos with a read-modify-write:
--   fotos = [...current, novaFoto]  ->  UPDATE
-- When an inspector sends several photos in quick succession, two handlers can
-- read the same `fotos` array and write back overlapping results, so photos are
-- LOST (e.g. 4 sent, only 2 stored).
--
-- This function appends a single photo to the open batch for a phone in ONE
-- atomic statement under a row lock, so concurrent appends can never overwrite
-- each other. It returns the updated row (id, fotos) so the caller can log/track.
--
-- array_append on a NULL/empty array yields a 1-element array, so the first
-- photo works too. We only touch the still-open batch for that phone.
-- =============================================================================

CREATE OR REPLACE FUNCTION append_foto_lote(p_phone TEXT, p_foto TEXT)
RETURNS TABLE (id UUID, fotos TEXT[])
LANGUAGE sql
AS $$
  UPDATE lotes_fotos
     SET fotos = array_append(COALESCE(fotos, ARRAY[]::TEXT[]), p_foto)
   WHERE id = (
     SELECT id
       FROM lotes_fotos
      WHERE phone = p_phone
        AND status = 'aberto'
      ORDER BY started_at DESC NULLS LAST
      LIMIT 1
      FOR UPDATE
   )
  RETURNING id, fotos;
$$;
