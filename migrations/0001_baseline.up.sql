-- =============================================================================
-- MIGRATION 0001: baseline
--
-- SAFETY: This migration is PRE-MARKED as already-applied during bootstrap
-- (see README section "Migrations"). It will NEVER be executed against the
-- live database. It exists purely as a version-controlled record of the schema
-- that was hand-created in the Supabase dashboard before migrations were
-- introduced. If you ever need to recreate the database from scratch, run this.
-- =============================================================================

-- ── admins ────────────────────────────────────────────────────────────────────
-- Stores admin users. id is a foreign key to Supabase Auth (auth.users).
-- Exactly one row may have role = 'owner' (enforced by partial unique index).
CREATE TABLE IF NOT EXISTS admins (
  id         UUID        PRIMARY KEY,
  email      TEXT        NOT NULL,
  nome       TEXT        NOT NULL,
  role       TEXT        NOT NULL,
  ativo      BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admins_one_owner
  ON admins (role)
  WHERE role = 'owner';

-- ── convites ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS convites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,
  token      TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'pendente',
  expira_em  TIMESTAMPTZ NOT NULL,
  criado_por UUID        NOT NULL REFERENCES admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── extintores ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS extintores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          TEXT        NOT NULL,
  unidade         TEXT        NOT NULL,
  setor           TEXT        NOT NULL,
  tipo_carga      TEXT        NOT NULL,
  capacidade      TEXT,
  vencimento_carga TEXT,
  vencimento_teste TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── inspecoes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspecoes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  extintor_numero     TEXT        NOT NULL,
  extintor_unidade    TEXT        NOT NULL,
  mes_referencia      TEXT        NOT NULL,
  data_inspecao       DATE        NOT NULL,
  inspetor            TEXT        NOT NULL,
  lacre               TEXT,
  vencimento_carga    TEXT,
  vencimento_teste    TEXT,
  manometro           TEXT,
  sinalizacao_parede  TEXT,
  sinalizacao_piso    TEXT,
  suporte             TEXT,
  mangueira           TEXT,
  quadro_instrucao    TEXT,
  status_geral        TEXT,
  observacoes         TEXT,
  fotos               TEXT[]      NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── lotes_fotos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lotes_fotos (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT        NOT NULL,
  legenda    TEXT        NOT NULL,
  fotos      TEXT[]      NOT NULL DEFAULT '{}',
  status     TEXT        NOT NULL DEFAULT 'aberto',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notificado BOOLEAN     NOT NULL DEFAULT false
);

-- ── transfer_ownership RPC ───────────────────────────────────────────────────
-- Atomically transfers ownership between two admins in a single transaction.
CREATE OR REPLACE FUNCTION transfer_ownership(
  novo_owner_id  UUID,
  owner_atual_id UUID
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE admins SET role = 'member' WHERE id = owner_atual_id AND role = 'owner';
  UPDATE admins SET role = 'owner'  WHERE id = novo_owner_id  AND role = 'member';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transferência inválida: novo_owner_id não é um membro ativo.';
  END IF;
END;
$$;
