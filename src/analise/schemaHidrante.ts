import { z } from "zod";

// Hydrant checklist is 4-state (matches the ficha columns), plus N.A /
// Indeterminado for items the AI can't see. The PDF checks the matching column.
export const statusHidrante = z.enum(["OK", "RUIM", "PENDENTE", "ENCAMINHAR", "N.A", "Indeterminado"]);
export type StatusHidrante = z.infer<typeof statusHidrante>;

// What the AI extracts from a hydrant's photo album. Mirrors RespostaIA, but the
// fields are the hydrant checklist items. Constants (esguicho/mangueira/
// chave_storz/setor) are NOT extracted here — they're protected, set on the slot.
export const RespostaHidranteSchema = z.object({
  numero_hidrante:        z.string(),
  unidade:                z.string().nullable(),
  setor:                  z.string().nullable(),
  inspetor:               z.string().nullable(),

  c_esguicho:             statusHidrante,
  c_condicoes_caixa:      statusHidrante,
  c_condicoes_acesso:     statusHidrante,
  c_identificacao_piso:   statusHidrante,
  c_identificacao_placa:  statusHidrante,
  c_mangueira:            statusHidrante,
  c_adaptador:            statusHidrante,
  c_chave_storz:          statusHidrante,
  c_teste:                statusHidrante,
  c_tampa_hidrante:       statusHidrante,

  status_geral:           z.string(),
  observacoes:            z.string(),
  confianca:              z.number().min(0).max(1),
});

export type RespostaHidrante = z.infer<typeof RespostaHidranteSchema>;

// The 10 checklist items, in display order (used by the PDF + edit UI).
export const ITENS_HIDRANTE = [
  { chave: "c_esguicho",            rotulo: "Esguicho" },
  { chave: "c_condicoes_caixa",     rotulo: "Condições da caixa" },
  { chave: "c_condicoes_acesso",    rotulo: "Condições de acesso" },
  { chave: "c_identificacao_piso",  rotulo: "Identificação (Piso)" },
  { chave: "c_identificacao_placa", rotulo: "Identificação (Placa)" },
  { chave: "c_mangueira",           rotulo: "Mangueira" },
  { chave: "c_adaptador",           rotulo: "Adaptador" },
  { chave: "c_chave_storz",         rotulo: "Chave Storz" },
  { chave: "c_teste",               rotulo: "Teste" },
  { chave: "c_tampa_hidrante",      rotulo: "Tampa Hidrante" },
] as const;

export type ItemHidranteChave = (typeof ITENS_HIDRANTE)[number]["chave"];
