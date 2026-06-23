// Hydrant-unit helpers (Phase 3), parallel to regioes.ts. The canonical list of
// hydrant units (e.g. "EDP") lives in unidades_hidrante; these resolve free-text
// inspector input to a canonical unit name and expose the per-unit count.

import { supabaseAdmin } from "../db-admin";
import { normalizarTexto } from "./regioes";

export interface UnidadeHidrante {
  nome: string;
  total_hidrantes: number;
  ordem: number;
}

function tokenAscii(s: string): string {
  return normalizarTexto(s).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

let cache: UnidadeHidrante[] | null = null;

export async function listarUnidadesHidrante(): Promise<UnidadeHidrante[]> {
  if (cache) return cache;
  const { data } = await supabaseAdmin
    .from("unidades_hidrante")
    .select("nome, total_hidrantes, ordem")
    .order("ordem");
  cache = (data as UnidadeHidrante[] | null) ?? [];
  return cache;
}

// Clears the in-memory cache (call after seeding/editing units).
export function limparCacheUnidadesHidrante(): void { cache = null; }

export async function resolverNomeUnidadeHidrante(input: string | null | undefined): Promise<string | null> {
  if (!input?.trim()) return null;
  const unidades = await listarUnidadesHidrante();

  const alvo = normalizarTexto(input);
  let hit = unidades.find((u) => normalizarTexto(u.nome) === alvo);
  if (hit) return hit.nome;

  const alvoAscii = tokenAscii(input);
  if (alvoAscii) {
    hit = unidades.find((u) => tokenAscii(u.nome) === alvoAscii);
    if (hit) return hit.nome;
    const candidatos = unidades.filter((u) => {
      const t = tokenAscii(u.nome);
      return t[0] === alvoAscii[0] &&
             Math.abs(t.length - alvoAscii.length) <= 2 &&
             (t.startsWith(alvoAscii.slice(0, 3)) || alvoAscii.startsWith(t.slice(0, 3)));
    });
    if (candidatos.length === 1) return candidatos[0].nome;
  }
  return null;
}

export async function totalDaUnidadeHidrante(nome: string): Promise<number | null> {
  const unidades = await listarUnidadesHidrante();
  const hit = unidades.find((u) => normalizarTexto(u.nome) === normalizarTexto(nome));
  return hit?.total_hidrantes ?? null;
}
