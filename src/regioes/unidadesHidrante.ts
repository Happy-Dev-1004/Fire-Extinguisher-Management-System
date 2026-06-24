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

// Classifies an inspector's free-text unit input against the canonical list.
//   "exata"   → resolved to exactly one unit (.nome)
//   "ambigua" → the text matches 2+ units (.candidatos) — e.g. "Ilhéus" matches
//               both "Fábrica Ilhéus" and "CW Ilhéus"; we must NOT guess.
//   "nenhuma" → no unit matched at all.
// resolverNomeUnidadeHidrante() is the thin wrapper that returns a name or null.
export type ClassificacaoUnidade =
  | { tipo: "exata"; nome: string }
  | { tipo: "ambigua"; candidatos: string[] }
  | { tipo: "nenhuma" };

export async function classificarUnidadeHidrante(
  input: string | null | undefined,
): Promise<ClassificacaoUnidade> {
  if (!input?.trim()) return { tipo: "nenhuma" };
  const unidades = await listarUnidadesHidrante();

  // 1. exact (accent-insensitive) name match wins outright.
  const alvo = normalizarTexto(input);
  const exato = unidades.find((u) => normalizarTexto(u.nome) === alvo);
  if (exato) return { tipo: "exata", nome: exato.nome };

  const alvoAscii = tokenAscii(input);
  if (!alvoAscii) return { tipo: "nenhuma" };

  // 2. exact ascii-token match.
  const exatoAscii = unidades.find((u) => tokenAscii(u.nome) === alvoAscii);
  if (exatoAscii) return { tipo: "exata", nome: exatoAscii.nome };

  // 3. substring match: the typed text appears as a whole word inside the unit
  //    name (or vice-versa). "ilheus" → "fabrica ilheus" AND "cw ilheus" → 2
  //    candidates → ambiguous. This is what catches a bare city name.
  const porSubstring = unidades.filter((u) => {
    const t = tokenAscii(u.nome);
    return t === alvoAscii || t.includes(alvoAscii) || alvoAscii.includes(t);
  });
  if (porSubstring.length === 1) return { tipo: "exata", nome: porSubstring[0].nome };
  if (porSubstring.length > 1) return { tipo: "ambigua", candidatos: porSubstring.map((u) => u.nome) };

  // 4. fuzzy first-letter/prefix match (typos), single hit only.
  const fuzzy = unidades.filter((u) => {
    const t = tokenAscii(u.nome);
    return t[0] === alvoAscii[0] &&
           Math.abs(t.length - alvoAscii.length) <= 2 &&
           (t.startsWith(alvoAscii.slice(0, 3)) || alvoAscii.startsWith(t.slice(0, 3)));
  });
  if (fuzzy.length === 1) return { tipo: "exata", nome: fuzzy[0].nome };
  if (fuzzy.length > 1) return { tipo: "ambigua", candidatos: fuzzy.map((u) => u.nome) };

  return { tipo: "nenhuma" };
}

export async function resolverNomeUnidadeHidrante(input: string | null | undefined): Promise<string | null> {
  const c = await classificarUnidadeHidrante(input);
  return c.tipo === "exata" ? c.nome : null;
}

export async function totalDaUnidadeHidrante(nome: string): Promise<number | null> {
  const unidades = await listarUnidadesHidrante();
  const hit = unidades.find((u) => normalizarTexto(u.nome) === normalizarTexto(nome));
  return hit?.total_hidrantes ?? null;
}
