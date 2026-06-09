-- =============================================================================
-- MIGRATION 0001: baseline (rollback)
--
-- WARNING: This drops ALL application tables and the ownership RPC.
-- Only run this if you are resetting a development/staging database from zero.
-- NEVER run against production.
-- =============================================================================

DROP FUNCTION IF EXISTS transfer_ownership(UUID, UUID);
DROP TABLE IF EXISTS lotes_fotos;
DROP TABLE IF EXISTS inspecoes;
DROP TABLE IF EXISTS extintores;
DROP TABLE IF EXISTS convites;
DROP TABLE IF EXISTS admins;
