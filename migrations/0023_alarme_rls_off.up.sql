-- =============================================================================
-- MIGRATION 0023: disable RLS on the alarm tables
--
-- These tables are written only by the trusted server (service-role client) and
-- read by owner/member-guarded routes. Like the other operational tables in this
-- project they don't use row-level security; disabling it explicitly avoids the
-- "new row violates row-level security policy" failure seen on the seed insert.
-- =============================================================================

ALTER TABLE centrais             DISABLE ROW LEVEL SECURITY;
ALTER TABLE dispositivos_alarme  DISABLE ROW LEVEL SECURITY;
