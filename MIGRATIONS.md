# Database Migrations

## Why this system exists

All schema changes are version-controlled SQL files in `migrations/`.
You never touch the Supabase SQL Editor manually again.
Every change is reviewed in git, reproducible from scratch, and rollback-safe.

## Tool choice: custom runner over Supabase Management API

**Why not node-pg-migrate / Prisma / Drizzle?**
All three require a direct TCP connection to Postgres (port 5432 or 6543).
Supabase free tier does not expose direct Postgres connections — the DB host
is not publicly reachable via TCP.

**What we use instead:**
A custom runner (`src/migrations/runner.ts`) that calls the
**Supabase Management API** (`POST /v1/projects/{ref}/database/query`).
This is exactly the same engine the Supabase SQL Editor uses — it runs
arbitrary SQL with full DDL permissions. The only difference is the transport.

**Trade-offs:**
| | This runner | node-pg-migrate |
|---|---|---|
| Free-tier compatible | ✅ | ❌ (needs direct TCP) |
| Transactional migrations | ⚠️ per-statement (API limitation) | ✅ full transaction |
| Standard tooling | Custom | Industry standard |
| PAT required | ✅ (one-time setup) | ❌ |

The main trade-off is that rollback on a partially-failed multi-statement migration
is not automatic — if migration 0004 has 3 statements and the 2nd fails, the 1st
has already run. Write each migration so every statement is safe to re-run
(`IF NOT EXISTS`, `IF EXISTS`, `CREATE OR REPLACE`).

---

## One-time setup

### 1. Get your Personal Access Token (PAT)

1. Go to [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
2. Click **Generate new token**
3. Name it (e.g. "extintor-migrations") — copy it immediately, it is shown only once
4. Add to `.env`:

```
SUPABASE_PROJECT_REF=edjtmbqhnewtzpvxdvst
SUPABASE_PAT=sbp_xxxxxxxxxxxxxxxxxxxx
```

### 2. Bootstrap the baseline (run exactly once on your live database)

Your existing tables were created manually before migrations existed.
This command records migration `0001` as already-applied **without running its SQL**.
It is completely safe — it only inserts one row into a new `schema_migrations` table.

```bash
npm run migrate:baseline
```

Expected output:
```
✓ Baseline (0001) marcada como aplicada sem executar o SQL.
  Suas tabelas existentes estão protegidas.
```

**Your existing data is untouched.** The `schema_migrations` table is the only thing created.

---

## Daily workflow: how to make a schema change

### Step 1 — Create the migration files

```bash
npm run migrate:create -- nome_da_mudanca
```

This creates two files:
```
migrations/0004_nome_da_mudanca.up.sql    ← write your ADD/CREATE here
migrations/0004_nome_da_mudanca.down.sql  ← write the UNDO here
```

### Step 2 — Write the SQL

**`.up.sql` example** (adding a column):
```sql
ALTER TABLE extintores
  ADD COLUMN IF NOT EXISTS ultima_vistoria DATE;
```

**`.down.sql` example** (undoing it):
```sql
ALTER TABLE extintores
  DROP COLUMN IF EXISTS ultima_vistoria;
```

Always use `IF NOT EXISTS` / `IF EXISTS` so migrations are safe to re-run.

### Step 3 — Apply it

```bash
npm run migrate:up
```

Expected output:
```
  → Aplicando 0004_nome_da_mudanca...
  ✓ 0004_nome_da_mudanca aplicada.

✓ migrate:up concluído — 1 migração(ões) aplicada(s).
```

### Step 4 — Commit both files

```bash
git add migrations/0004_nome_da_mudanca.up.sql migrations/0004_nome_da_mudanca.down.sql
git commit -m "db: add ultima_vistoria column to extintores"
```

---

## Available commands

| Command | What it does |
|---|---|
| `npm run migrate:status` | Show which migrations are applied vs pending |
| `npm run migrate:up` | Apply all pending migrations in order |
| `npm run migrate:down` | Roll back the last applied migration |
| `npm run migrate:baseline` | Mark 0001 as applied without running SQL (run once only) |
| `npm run migrate:create -- name` | Scaffold a new migration file pair |

---

## How migration tracking works

The runner maintains a table called `schema_migrations`:

```sql
CREATE TABLE schema_migrations (
  version     TEXT        PRIMARY KEY,   -- "0001", "0002", ...
  name        TEXT        NOT NULL,      -- "baseline", "missing_columns", ...
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Before running a migration, the runner checks:
```sql
SELECT version FROM schema_migrations WHERE version = '0004'
```

If the row exists → **skip** (already applied).
If absent → **run the SQL**, then insert the row.

This makes `migrate:up` **idempotent**: running it twice does nothing the second time.

---

## Migration inventory

| Version | Name | What it does |
|---|---|---|
| 0001 | baseline | Full schema as-of initial manual creation. Never executed against live DB — marked via `migrate:baseline`. |
| 0002 | missing_columns_and_configuracoes | Adds `inspecoes.lote_id`, `inspecoes.tem_irregularidade`, `extintores.cadastro_pendente`, creates `configuracoes` table. |
| 0003 | smoke_test | Adds nullable `migration_smoke_test` column to `lotes_fotos` — workflow proof. Can be rolled back with `migrate:down`. |

---

## Safety guarantees

- **Never drops existing tables** — every migration uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`
- **Baseline is never re-executed** — `migrate:baseline` only inserts a tracking row
- **Running `migrate:up` twice is safe** — already-applied versions are skipped
- **Rollback available** — every migration has a `.down.sql`; `migrate:down` reverts the last one
- **Version-controlled** — all SQL lives in git alongside the application code
