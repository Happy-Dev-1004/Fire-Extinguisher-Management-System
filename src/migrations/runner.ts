/**
 * Migration runner — Supabase free-tier compatible (no direct Postgres TCP).
 *
 * Transport: Supabase Management API  →  POST /v1/projects/{ref}/database/query
 * This endpoint executes arbitrary SQL using your personal access token (PAT).
 * It is the same engine as the Supabase SQL Editor — no direct Postgres port needed.
 *
 * Required .env variables:
 *   SUPABASE_PROJECT_REF   — e.g. "edjtmbqhnewtzpvxdvst"
 *   SUPABASE_PAT           — personal access token from supabase.com/dashboard/account/tokens
 *
 * How migration tracking works:
 *   A table `schema_migrations` is created on first run (CREATE TABLE IF NOT EXISTS).
 *   Each applied migration is recorded as a row: (version, name, applied_at).
 *   Before running any migration, the runner checks that version is NOT already
 *   in schema_migrations. If it is, the migration is skipped — making migrate:up
 *   safe and idempotent no matter how many times it is called.
 *
 * Baseline safety:
 *   Migration 0001 (baseline) is pre-inserted into schema_migrations without
 *   executing its SQL, via a dedicated bootstrap step. This tells the runner
 *   "these tables already exist" so it never tries to CREATE TABLE on live data.
 */

import "dotenv/config";
import https from "https";
import fs from "fs";
import path from "path";
import { logger } from "../logger";

const log = logger.child({ modulo: "migrations" });

const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

export interface Migration {
  version: string;      // e.g. "0001"
  name: string;         // e.g. "baseline"
  upFile: string;       // absolute path to .up.sql
  downFile: string | null;
}

// ── Supabase Management API client ────────────────────────────────────────────

function getApiConfig(): { projectRef: string; pat: string } {
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  const pat        = process.env.SUPABASE_PAT?.trim();
  if (!projectRef) throw new Error("SUPABASE_PROJECT_REF não definida no .env");
  if (!pat)        throw new Error("SUPABASE_PAT não definida no .env");
  return { projectRef, pat };
}

function execSQL(sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const { projectRef, pat } = getApiConfig();
    const body = JSON.stringify({ query: sql });

    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${projectRef}/database/query`,
        method: "POST",
        headers: {
          "Authorization": `Bearer ${pat}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            try { resolve(JSON.parse(data)); }
            catch { resolve([]); }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── schema_migrations bootstrap ───────────────────────────────────────────────

async function ensureMigrationsTable(): Promise<void> {
  await execSQL(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT        PRIMARY KEY,
      name        TEXT        NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// ── Migration file discovery ──────────────────────────────────────────────────

export function discoverMigrations(): Migration[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  const files = fs.readdirSync(MIGRATIONS_DIR).sort();
  const map = new Map<string, Partial<Migration>>();

  for (const file of files) {
    const match = file.match(/^(\d{4})_([^.]+)\.(up|down)\.sql$/);
    if (!match) continue;
    const [, version, name, direction] = match;
    if (!map.has(version)) map.set(version, { version, name });
    const entry = map.get(version)!;
    const abs = path.join(MIGRATIONS_DIR, file);
    if (direction === "up")   entry.upFile   = abs;
    if (direction === "down") entry.downFile = abs;
  }

  return Array.from(map.values())
    .filter((m): m is Migration => !!m.upFile)
    .map(m => ({ ...m, downFile: m.downFile ?? null } as Migration));
}

// ── Applied version lookup ────────────────────────────────────────────────────

async function getAppliedVersions(): Promise<Set<string>> {
  const rows = await execSQL(
    "SELECT version FROM schema_migrations ORDER BY version"
  ) as { version: string }[];
  return new Set(rows.map(r => r.version));
}

// ── migrate:up ───────────────────────────────────────────────────────────────

export async function migrateUp(): Promise<void> {
  await ensureMigrationsTable();
  const applied  = await getAppliedVersions();
  const all      = discoverMigrations();
  const pending  = all.filter(m => !applied.has(m.version));

  if (pending.length === 0) {
    log.info("Nenhuma migração pendente — banco já está atualizado.");
    console.log("✓ Nenhuma migração pendente.");
    return;
  }

  for (const migration of pending) {
    const sql = fs.readFileSync(migration.upFile, "utf8");
    log.info({ version: migration.version, name: migration.name }, "Aplicando migração...");
    console.log(`  → Aplicando ${migration.version}_${migration.name}...`);

    // Execute the migration SQL
    await execSQL(sql);

    // Record it as applied
    await execSQL(
      `INSERT INTO schema_migrations (version, name) VALUES ('${migration.version}', '${migration.name}')`
    );

    log.info({ version: migration.version }, "Migração aplicada.");
    console.log(`  ✓ ${migration.version}_${migration.name} aplicada.`);
  }

  console.log(`\n✓ migrate:up concluído — ${pending.length} migração(ões) aplicada(s).`);
}

// ── migrate:down ─────────────────────────────────────────────────────────────

export async function migrateDown(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedVersions();
  const all     = discoverMigrations();

  const toRevert = all
    .filter(m => applied.has(m.version) && m.downFile !== null)
    .at(-1);

  if (!toRevert) {
    log.info("Nenhuma migração para reverter.");
    console.log("✓ Nenhuma migração para reverter.");
    return;
  }

  const sql = fs.readFileSync(toRevert.downFile!, "utf8");
  log.info({ version: toRevert.version, name: toRevert.name }, "Revertendo migração...");
  console.log(`  → Revertendo ${toRevert.version}_${toRevert.name}...`);

  await execSQL(sql);
  await execSQL(
    `DELETE FROM schema_migrations WHERE version = '${toRevert.version}'`
  );

  log.info({ version: toRevert.version }, "Migração revertida.");
  console.log(`  ✓ ${toRevert.version}_${toRevert.name} revertida.\n`);
}

// ── migrate:status ────────────────────────────────────────────────────────────

export async function migrateStatus(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedVersions();
  const all     = discoverMigrations();

  console.log("\nStatus das migrações:");
  console.log("─".repeat(55));
  for (const m of all) {
    const mark = applied.has(m.version) ? "✓" : "○";
    const label = applied.has(m.version) ? "aplicada" : "pendente";
    console.log(`  ${mark}  ${m.version}  ${label.padEnd(10)}  ${m.name}`);
  }
  console.log("─".repeat(55));
  const pendingCount = all.filter(m => !applied.has(m.version)).length;
  console.log(`  ${applied.size} aplicada(s), ${pendingCount} pendente(s)\n`);
}

// ── migrate:baseline ─────────────────────────────────────────────────────────
// Marks migration 0001 as already-applied WITHOUT running its SQL.
// Run this exactly once on a database that already has the tables.

export async function migrateBaseline(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedVersions();

  if (applied.has("0001")) {
    console.log("✓ Baseline já marcada como aplicada — nada a fazer.");
    return;
  }

  await execSQL(
    `INSERT INTO schema_migrations (version, name) VALUES ('0001', 'baseline')`
  );
  console.log("✓ Baseline (0001) marcada como aplicada sem executar o SQL.");
  console.log("  Suas tabelas existentes estão protegidas.\n");
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const command = process.argv[2];

  const commands: Record<string, () => Promise<void>> = {
    up:       migrateUp,
    down:     migrateDown,
    status:   migrateStatus,
    baseline: migrateBaseline,
  };

  const run = commands[command];
  if (!run) {
    console.error("Uso: npm run migrate:[up|down|status|baseline]");
    process.exit(1);
  }

  run().catch(err => {
    console.error("\n✗ Erro fatal:", err.message);
    process.exit(1);
  });
}
