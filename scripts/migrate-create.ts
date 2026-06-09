/**
 * Scaffolds a new migration file pair: NNNN_name.up.sql + NNNN_name.down.sql
 *
 * Usage:
 *   npm run migrate:create -- add_column_to_extintores
 *
 * The version number is auto-incremented from the highest existing migration.
 */

import fs from "fs";
import path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

function nextVersion(): string {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return "0001";
  }
  const files = fs.readdirSync(MIGRATIONS_DIR);
  const versions = files
    .map(f => f.match(/^(\d{4})_/)?.[1])
    .filter(Boolean)
    .map(Number);
  const max = versions.length > 0 ? Math.max(...versions) : 0;
  return String(max + 1).padStart(4, "0");
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const rawName = process.argv[2];
if (!rawName) {
  console.error("Erro: informe o nome da migração.");
  console.error("  Exemplo: npm run migrate:create -- add_coluna_extintores");
  process.exit(1);
}

const version = nextVersion();
const slug    = slugify(rawName);
const base    = `${version}_${slug}`;
const upPath  = path.join(MIGRATIONS_DIR, `${base}.up.sql`);
const downPath = path.join(MIGRATIONS_DIR, `${base}.down.sql`);

fs.writeFileSync(upPath, `-- Migração ${version}: ${slug}\n-- Escreva aqui o SQL para APLICAR a mudança.\n\n`);
fs.writeFileSync(downPath, `-- Migração ${version}: ${slug} (rollback)\n-- Escreva aqui o SQL para REVERTER a mudança.\n\n`);

console.log(`\nArquivos criados:`);
console.log(`  migrations/${base}.up.sql`);
console.log(`  migrations/${base}.down.sql`);
console.log(`\nEdite os dois arquivos, depois execute: npm run migrate:up\n`);
