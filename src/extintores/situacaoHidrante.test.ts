import { describe, it, expect } from "vitest";
import { calcularSituacaoHidrante } from "./situacaoHidrante";

describe("calcularSituacaoHidrante", () => {
  it("indeterminado when nothing inspected", () => {
    expect(calcularSituacaoHidrante({})).toBe("indeterminado");
    expect(calcularSituacaoHidrante({ c_esguicho: "", c_mangueira: null })).toBe("indeterminado");
  });

  it("ok when items are present and all OK", () => {
    expect(calcularSituacaoHidrante({ c_esguicho: "OK", c_mangueira: "OK" })).toBe("ok");
  });

  it("pendente when an item is PENDENTE (and nothing worse)", () => {
    expect(calcularSituacaoHidrante({ c_esguicho: "OK", c_chave_storz: "PENDENTE" })).toBe("pendente");
  });

  it("atencao when any item is RUIM or ENCAMINHAR (wins over pendente)", () => {
    expect(calcularSituacaoHidrante({ c_esguicho: "PENDENTE", c_mangueira: "RUIM" })).toBe("atencao");
    expect(calcularSituacaoHidrante({ c_teste: "ENCAMINHAR" })).toBe("atencao");
  });

  it("N.A-only items count as inspected but not OK → indeterminado", () => {
    expect(calcularSituacaoHidrante({ c_esguicho: "N.A", c_mangueira: "N.A" })).toBe("indeterminado");
  });
});
