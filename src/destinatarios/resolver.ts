// Resolves the effective recipient list for a given unidade.
//
// Effective recipients = active site-specific rows (unidade = site)
//                      UNION active all-units rows (unidade = '*')
// De-duplicated by telefone_normalizado — a person who holds both a
// site-specific and an all-units subscription gets exactly one entry
// (the site-specific row wins so the name is most accurate).

import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";

const log = logger.child({ modulo: "destinatarios/resolver" });

export interface DestinatarioResolvido {
  id:                   string;
  nome:                 string;
  telefone:             string;
  telefone_normalizado: string;
  email:                string | null;
  unidade:              string; // the scope that matched: site name or '*'
}

export const TODAS_UNIDADES = "*";

/**
 * Returns the de-duplicated list of active recipients for a given site.
 * Never throws — returns an empty array on DB error (logged at error level).
 */
export async function resolverDestinatarios(
  unidade: string
): Promise<DestinatarioResolvido[]> {
  const { data, error } = await supabaseAdmin
    .from("destinatarios_ficha")
    .select("id, nome, telefone, telefone_normalizado, email, unidade")
    .in("unidade", [unidade, TODAS_UNIDADES])
    .eq("ativo", true)
    .order("unidade")   // '*' sorts before site names — all-units first
    .order("nome");

  if (error) {
    log.error({ err: error.message, unidade }, "falha ao resolver destinatários");
    return [];
  }

  if (!data || data.length === 0) return [];

  // De-duplicate by telefone_normalizado.
  // Because we order by unidade ASC, site-specific rows ('<site>') come
  // after all-units rows ('*') alphabetically — so we iterate and the
  // site-specific entry overwrites the all-units one for the same phone.
  const seen = new Map<string, DestinatarioResolvido>();
  for (const row of data as DestinatarioResolvido[]) {
    // Always overwrite: since order is '*' first, a site row naturally wins.
    seen.set(row.telefone_normalizado, row);
  }

  return Array.from(seen.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
