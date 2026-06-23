import { describe, it, expect } from "vitest";
import { RespostaHidranteSchema, ITENS_HIDRANTE } from "./schemaHidrante";

const base = {
  numero_hidrante: "1", unidade: "EDP", setor: "Portaria", inspetor: "Rodrigo",
  c_esguicho: "OK", c_condicoes_caixa: "OK", c_condicoes_acesso: "OK",
  c_identificacao_piso: "OK", c_identificacao_placa: "OK", c_mangueira: "OK",
  c_adaptador: "OK", c_chave_storz: "OK", c_teste: "OK", c_tampa_hidrante: "OK",
  status_geral: "Conforme", observacoes: "", confianca: 0.9,
};

describe("RespostaHidranteSchema", () => {
  it("accepts a valid hydrant response", () => {
    expect(RespostaHidranteSchema.safeParse(base).success).toBe(true);
  });

  it("accepts all 4 checklist states + N.A / Indeterminado", () => {
    for (const v of ["OK", "RUIM", "PENDENTE", "ENCAMINHAR", "N.A", "Indeterminado"]) {
      expect(RespostaHidranteSchema.safeParse({ ...base, c_esguicho: v }).success).toBe(true);
    }
  });

  it("rejects an invalid checklist value (e.g. Reprovado from Phase 1)", () => {
    expect(RespostaHidranteSchema.safeParse({ ...base, c_esguicho: "Reprovado" }).success).toBe(false);
  });

  it("rejects confianca out of [0,1]", () => {
    expect(RespostaHidranteSchema.safeParse({ ...base, confianca: 1.5 }).success).toBe(false);
  });

  it("exposes the 10 checklist items in order with pt-BR labels", () => {
    expect(ITENS_HIDRANTE).toHaveLength(10);
    expect(ITENS_HIDRANTE[0]).toEqual({ chave: "c_esguicho", rotulo: "Esguicho" });
    expect(ITENS_HIDRANTE[7]).toEqual({ chave: "c_chave_storz", rotulo: "Chave Storz" });
    expect(ITENS_HIDRANTE[9]).toEqual({ chave: "c_tampa_hidrante", rotulo: "Tampa Hidrante" });
  });
});
