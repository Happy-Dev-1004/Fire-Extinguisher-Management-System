// Hydrant situação is derived from the checklist (no expiry dates):
//   any item RUIM/ENCAMINHAR → "atencao" (needs attention)
//   any item PENDENTE         → "pendente"
//   at least one OK, nothing worse → "ok"
//   nothing inspected yet      → "indeterminado"

import { ITENS_HIDRANTE } from "../analise/schemaHidrante";

export type SituacaoHidrante = "atencao" | "pendente" | "ok" | "indeterminado";

export function calcularSituacaoHidrante(h: Record<string, any>): SituacaoHidrante {
  const valores = ITENS_HIDRANTE.map(({ chave }) => h[chave]).filter((v) => v != null && v !== "");
  if (valores.length === 0) return "indeterminado";
  if (valores.some((v) => v === "RUIM" || v === "ENCAMINHAR")) return "atencao";
  if (valores.some((v) => v === "PENDENTE")) return "pendente";
  if (valores.some((v) => v === "OK")) return "ok";
  return "indeterminado";
}
