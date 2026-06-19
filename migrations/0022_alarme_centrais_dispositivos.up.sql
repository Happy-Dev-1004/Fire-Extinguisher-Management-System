-- =============================================================================
-- MIGRATION 0022: PHASE 2 — fire-alarm installation registry
--
-- Multi-panel topology:  central (panel) -> laço (loop) -> ponto (device).
-- A site has 4 control panels; each covers an area; each panel has loops; each
-- loop holds addressed points (devices).
--
-- INCREMENTAL-DATA DESIGN (important):
--   `laco` and `endereco` on a device are intentionally NULLABLE. The client is
--   delivering the installation mapping in stages — we know the device counts
--   per sector/panel now, but the loop assignment and the per-point address
--   (e.g. 101, 137) come later as the install proceeds. Making them nullable lets
--   us register every device TODAY (by panel + sector + type) and fill in the
--   loop/address LATER via an edit, with no schema change and no fake data. A
--   device with null endereco is a real, tracked device "awaiting addressing".
--   `cadastro_pendente` defaults true and is cleared once a device is fully
--   specified, so partially-known devices are always visible as such.
-- =============================================================================

-- ── centrais (control panels) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS centrais (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          INTEGER     NOT NULL UNIQUE CHECK (numero BETWEEN 1 AND 99),
  nome            TEXT        NOT NULL,
  area_cobertura  TEXT,
  modelo          TEXT,                       -- nullable where unknown (e.g. Octo+1L)
  ativo           BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the 4 known panels. Idempotent: re-running updates nome/area, never
-- duplicates (numero is unique). modelo left NULL where unknown.
INSERT INTO centrais (numero, nome, area_cobertura) VALUES
  (1, 'Central 1', 'Portaria Principal'),
  (2, 'Central 2', 'Logística'),
  (3, 'Central 3', 'Fábrica'),
  (4, 'Central 4', 'Caldeira')
ON CONFLICT (numero) DO UPDATE
  SET nome = EXCLUDED.nome,
      area_cobertura = EXCLUDED.area_cobertura;

-- ── dispositivos_alarme (the point registry) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS dispositivos_alarme (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  central_id         UUID        NOT NULL REFERENCES centrais(id),
  laco               INTEGER,                  -- NULLABLE: loop not always known yet
  endereco           TEXT,                     -- NULLABLE: point address (101,137...) filled later
  tipo_dispositivo   TEXT        NOT NULL
                       CHECK (tipo_dispositivo IN (
                         'detector_fumaca','detector_temperatura','detector_linear',
                         'acionador','sirene','modulo_supervisao','isolador','outro')),
  setor              TEXT        NOT NULL DEFAULT '',
  descricao          TEXT,
  status_instalacao  TEXT        NOT NULL DEFAULT 'pendente'
                       CHECK (status_instalacao IN ('pendente','instalado','enderecado','testado')),
  data_instalacao    DATE,
  fotos              TEXT[]      NOT NULL DEFAULT '{}',
  observacoes        TEXT,
  cadastro_pendente  BOOLEAN     NOT NULL DEFAULT true,
  ativo              BOOLEAN     NOT NULL DEFAULT true,   -- soft-delete flag
  -- Stable per-device seed key so the idempotent seed can upsert without
  -- duplicating: <central_numero>|<tipo>|<setor>|<ordinal>. NULL for devices
  -- created manually via the API.
  seed_key           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_seed_key_uq
  ON dispositivos_alarme (seed_key) WHERE seed_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS dispositivos_central_idx ON dispositivos_alarme (central_id);
CREATE INDEX IF NOT EXISTS dispositivos_tipo_idx    ON dispositivos_alarme (tipo_dispositivo);
CREATE INDEX IF NOT EXISTS dispositivos_setor_idx   ON dispositivos_alarme (setor);
CREATE INDEX IF NOT EXISTS dispositivos_status_idx  ON dispositivos_alarme (status_instalacao);

-- keep updated_at fresh on any change
CREATE OR REPLACE FUNCTION dispositivos_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS dispositivos_set_updated_at ON dispositivos_alarme;
CREATE TRIGGER dispositivos_set_updated_at
  BEFORE UPDATE ON dispositivos_alarme
  FOR EACH ROW EXECUTE FUNCTION dispositivos_touch_updated_at();
