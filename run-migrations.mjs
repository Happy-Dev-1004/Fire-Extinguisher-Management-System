/**
 * One-shot migration runner.
 * Reads all .up.sql files from migrations/ and applies them via pg.
 * Safe to re-run: all DDL uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 *
 * Usage:
 *   node run-migrations.mjs
 *
 * Requires DATABASE_URL in .env, e.g.:
 *   postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
 */

import "dotenv/config";
import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("ERROR: DATABASE_URL not set in .env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected to database.");

  const migrationsDir = join(__dirname, "migrations");
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith(".up.sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`\nApplying ${file}...`);
    try {
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }

  console.log("\nDone.");
} finally {
  await client.end();
}
