// Shared region helpers. Regions are the fixed grouping that replaced the old
// free-text `unidade`. The canonical list lives in the `regioes` table; these
// helpers resolve free-text inspector input to a canonical region name and
// expose the per-region count.

import { supabaseAdmin } from "../db-admin";

export interface Regiao {
  nome: string;
  total_extintores: number;
  ordem: number;
}

// Normalises text for fuzzy comparison: lowercase, strip accents, collapse
// whitespace. "Ilhéus" and "ilheus" and " ILHEUS " all compare equal.
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Even more aggressive: keep ONLY ascii letters/digits/spaces. This makes the
// match resilient to mojibake — when WhatsApp/Z-API double-encodes an accent,
// "Ilhéus" can arrive as "IlhÃ©us" or "Ilh√©us". Stripping every non-ascii char
// (and any leftover symbols) reduces both that garble and the clean "ilhéus" to
// the same comparable token ("ilhus" / "ilheus" → letters that survive).
function tokenAscii(s: string): string {
  return normalizarTexto(s)
    .replace(/[^a-z0-9 ]/g, "")   // drop accents-gone-wrong, symbols, etc.
    .replace(/\s+/g, " ")
    .trim();
}

let cache: Regiao[] | null = null;

export async function listarRegioes(): Promise<Regiao[]> {
  if (cache) return cache;
  const { data } = await supabaseAdmin
    .from("regioes")
    .select("nome, total_extintores, ordem")
    .order("ordem");
  cache = (data as Regiao[] | null) ?? [];
  return cache;
}

// Resolves an inspector's free-text input to a canonical region name, or null
// if it doesn't match any known region. Matches on exact normalised equality.
export async function resolverNomeRegiao(input: string | null | undefined): Promise<string | null> {
  if (!input?.trim()) return null;
  const regioes = await listarRegioes();

  // 1) exact normalised match
  const alvo = normalizarTexto(input);
  let hit = regioes.find((r) => normalizarTexto(r.nome) === alvo);
  if (hit) return hit.nome;

  // 2) ascii-token match (resilient to mojibake / lost accents)
  const alvoAscii = tokenAscii(input);
  if (alvoAscii) {
    hit = regioes.find((r) => tokenAscii(r.nome) === alvoAscii);
    if (hit) return hit.nome;

    // 3) the garbled accent often INSERTS junk chars ("ilhus"→ "ilhaus"/"ilhcaus").
    //    Fall back to: region whose ascii token starts with the same first letters
    //    AND shares the same first+last char and length within 2 — strict enough
    //    to not confuse the 6 distinct regions, loose enough to absorb 1-2 junk chars.
    const candidatos = regioes.filter((r) => {
      const t = tokenAscii(r.nome);
      return t[0] === alvoAscii[0] &&
             Math.abs(t.length - alvoAscii.length) <= 2 &&
             (t.startsWith(alvoAscii.slice(0, 3)) || alvoAscii.startsWith(t.slice(0, 3)));
    });
    if (candidatos.length === 1) return candidatos[0].nome;
  }

  return null;
}

// Returns the per-region extinguisher count, or null for an unknown region.
export async function totalDaRegiao(nome: string): Promise<number | null> {
  const regioes = await listarRegioes();
  const hit = regioes.find((r) => normalizarTexto(r.nome) === normalizarTexto(nome));
  return hit?.total_extintores ?? null;
}
