import { z } from "zod";

const statusItem = z.enum(["OK", "Reprovado", "N.A", "Indeterminado"]);

export const RespostaIASchema = z.object({
  numero_extintor:       z.string(),
  unidade:               z.string().nullable(),
  setor:                 z.string().nullable(),
  tipo_carga:            z.string(),
  capacidade:            z.string(),
  vencimento_carga:      z.string(),
  vencimento_teste:      z.string(),
  inspetor:              z.string().nullable(),

  lacre:                 statusItem,
  vencimento_carga_status: statusItem,
  vencimento_teste_status: statusItem,
  manometro:             statusItem,
  sinalizacao_parede:    statusItem,
  sinalizacao_piso:      statusItem,
  suporte:               statusItem,
  mangueira:             statusItem,
  quadro_instrucao:      statusItem,

  status_geral:          z.string(),
  observacoes:           z.string(),
  confianca:             z.number().min(0).max(1),
});

export type RespostaIA = z.infer<typeof RespostaIASchema>;
