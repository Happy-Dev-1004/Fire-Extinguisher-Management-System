-- =============================================================================
-- MIGRATION 0025: device photo record (P2-5)
--
-- Per-device photos reuse dispositivos_alarme.fotos[] (already present). This
-- migration adds the ORPHAN store for device photos that arrive over WhatsApp
-- but can't be matched to a device — so a photo is NEVER lost; it's parked for
-- a human to assign in the dashboard (same pattern as inspecoes_pendentes).
--
-- Also adds a per-supervisor "device photo context" so a supervisor can name a
-- device once, then send several photos that all attach to it (caption-boundary
-- idea reused from Phase 1).
-- =============================================================================

CREATE TABLE IF NOT EXISTS dispositivo_fotos_pendentes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  identificador   TEXT,                    -- what the supervisor typed (endereco / "setor tipo")
  central_numero  INTEGER,                 -- context central, if known
  foto_url        TEXT        NOT NULL,    -- the stored (downscaled) photo URL
  motivo          TEXT,                    -- why it couldn't be matched
  resolvido       BOOLEAN     NOT NULL DEFAULT false,
  dispositivo_id  UUID        REFERENCES dispositivos_alarme(id), -- set when resolved
  telefone_origem TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disp_fotos_pend_resolvido_idx ON dispositivo_fotos_pendentes (resolvido);

-- Per-supervisor active "current device" for the WhatsApp photo flow. The
-- supervisor sends a device identifier; following photos attach to it until they
-- name another device or send "encerrar dispositivo".
CREATE TABLE IF NOT EXISTS dispositivo_foto_sessoes (
  telefone_normalizado TEXT        PRIMARY KEY,
  dispositivo_id       UUID        REFERENCES dispositivos_alarme(id),
  central_numero       INTEGER,
  ultimo_identificador TEXT,
  ultima_msg_id        TEXT,
  atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dispositivo_fotos_pendentes DISABLE ROW LEVEL SECURITY;
ALTER TABLE dispositivo_foto_sessoes    DISABLE ROW LEVEL SECURITY;

-- Atomic photo append for a device (mirrors append_foto_lote for extinguishers):
-- appends one URL to fotos[] and, on the first photo, marks the device installed
-- and stamps data_instalacao if it isn't set yet. Returns the new fotos array so
-- the caller can report the running count. Concurrent album photos can't clobber.
CREATE OR REPLACE FUNCTION append_foto_dispositivo(p_id UUID, p_foto TEXT)
RETURNS TABLE (fotos TEXT[]) AS $$
  UPDATE dispositivos_alarme
     SET fotos = array_append(COALESCE(fotos, '{}'), p_foto),
         status_instalacao = CASE
           WHEN status_instalacao = 'pendente' THEN 'instalado'
           ELSE status_instalacao
         END,
         data_instalacao = COALESCE(data_instalacao, CURRENT_DATE),
         updated_at = now()
   WHERE id = p_id
  RETURNING fotos;
$$ LANGUAGE sql;
