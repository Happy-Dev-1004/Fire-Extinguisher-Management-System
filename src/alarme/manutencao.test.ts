import { describe, it, expect } from "vitest";
import { calcularSituacaoManutencao, ETAPAS_MANUTENCAO } from "./manutencao";

describe("manutenção do alarme", () => {
  it("has the 7 flowchart steps in order", () => {
    expect(ETAPAS_MANUTENCAO).toHaveLength(7);
    expect(ETAPAS_MANUTENCAO[0].chave).toBe("e1_planejamento");
    expect(ETAPAS_MANUTENCAO[6].chave).toBe("e7_relatorio");
  });

  it("indeterminado when nothing is filled", () => {
    expect(calcularSituacaoManutencao({})).toBe("indeterminado");
    expect(calcularSituacaoManutencao({ e1_planejamento: "", e4_testes: "" })).toBe("indeterminado");
  });

  it("atencao when any step is NC (não-conformidade)", () => {
    expect(calcularSituacaoManutencao({ e3_inspecao_visual: "OK", e4_testes: "NC" })).toBe("atencao");
  });

  it("ok when steps are filled and none is NC", () => {
    expect(calcularSituacaoManutencao({ e1_planejamento: "OK", e2_preparacao: "N.A" })).toBe("ok");
  });

  it("N.A-only (nothing OK, nothing NC) → indeterminado", () => {
    expect(calcularSituacaoManutencao({ e1_planejamento: "N.A", e2_preparacao: "N.A" })).toBe("indeterminado");
  });
});
