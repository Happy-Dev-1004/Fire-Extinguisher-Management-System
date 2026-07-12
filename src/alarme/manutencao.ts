// Shared definitions for the alarm preventive-maintenance module (Fase 2).
// One visit covers one central; each of the 7 flowchart steps is a 4-state value
// (OK | NC | N.A | "") plus an observação. Used by routes, PDF, and (mirrored) UI.

export const STATUS_ETAPA = ["OK", "NC", "N.A", ""] as const;
export type StatusEtapa = (typeof STATUS_ETAPA)[number];

// The 7 preventive-visit steps, from the proposal's flowchart, in order.
export const ETAPAS_MANUTENCAO = [
  { chave: "e1_planejamento",    rotulo: "Planejamento da visita" },
  { chave: "e2_preparacao",      rotulo: "Chegada e preparação" },
  { chave: "e3_inspecao_visual", rotulo: "Inspeção visual" },
  { chave: "e4_testes",          rotulo: "Testes funcionais" },
  { chave: "e5_verificacoes",    rotulo: "Verificações técnicas" },
  { chave: "e6_ajustes",         rotulo: "Ajustes e correções" },
  { chave: "e7_relatorio",       rotulo: "Relatório e encerramento" },
] as const;

export type EtapaChave = (typeof ETAPAS_MANUTENCAO)[number]["chave"];

// Situação derived from the checklist, mirroring the hydrant situação idea:
//   any NC → "atencao"; nothing filled → "indeterminado"; else "ok".
export type SituacaoManutencao = "atencao" | "ok" | "indeterminado";

export function calcularSituacaoManutencao(v: Record<string, unknown>): SituacaoManutencao {
  const valores = ETAPAS_MANUTENCAO
    .map(({ chave }) => v[chave])
    .filter((x): x is string => typeof x === "string" && x !== "");
  if (valores.length === 0) return "indeterminado";
  if (valores.some((x) => x === "NC")) return "atencao";
  if (valores.some((x) => x === "OK")) return "ok";
  return "indeterminado";
}
