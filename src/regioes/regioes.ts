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
  const alvo = normalizarTexto(input);
  const regioes = await listarRegioes();
  const hit = regioes.find((r) => normalizarTexto(r.nome) === alvo);
  return hit?.nome ?? null;
}

// Returns the per-region extinguisher count, or null for an unknown region.
export async function totalDaRegiao(nome: string): Promise<number | null> {
  const regioes = await listarRegioes();
  const hit = regioes.find((r) => normalizarTexto(r.nome) === normalizarTexto(nome));
  return hit?.total_extintores ?? null;
}
