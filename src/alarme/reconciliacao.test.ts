import { describe, it, expect } from "vitest";
import { reconciliar, resumoTexto } from "./reconciliacao";

describe("reconciliar — BOM gap report", () => {
  it("reports the current real gaps (acionadores 55/65, sirenes 56/65, modulos 0/64, isoladores 0/30)", () => {
    const rec = reconciliar({
      acionador: 55,
      sirene: 56,
      modulo_supervisao: 0,
      isolador: 0,
    });
    const byTipo = Object.fromEntries(rec.linhas.map((l) => [l.tipo, l]));

    expect(byTipo.acionador.cadastrados).toBe(55);
    expect(byTipo.acionador.esperado).toBe(65);
    expect(byTipo.acionador.faltam).toBe(10);

    expect(byTipo.sirene.faltam).toBe(9);          // 65 - 56
    expect(byTipo.modulo_supervisao.faltam).toBe(64);
    expect(byTipo.isolador.faltam).toBe(30);
  });

  it("shows EVERY expected type even when count is zero (full gap visible)", () => {
    const rec = reconciliar({});
    const tipos = rec.linhas.map((l) => l.tipo);
    for (const t of ["detector_fumaca","detector_temperatura","detector_linear","acionador","sirene","modulo_supervisao","isolador"]) {
      expect(tipos).toContain(t);
    }
    expect(rec.linhas.find((l) => l.tipo === "detector_fumaca")!.faltam).toBe(264);
    expect(rec.completo).toBe(false);
  });

  it("marks a type complete when registered === expected, and reports excedente when over", () => {
    const rec = reconciliar({
      detector_fumaca: 264, detector_temperatura: 14, detector_linear: 32,
      acionador: 65, sirene: 65, modulo_supervisao: 64, isolador: 70,
    });
    expect(rec.linhas.find((l) => l.tipo === "acionador")!.completo).toBe(true);
    const iso = rec.linhas.find((l) => l.tipo === "isolador")!;
    expect(iso.excedente).toBe(40);
    expect(iso.completo).toBe(false);
  });

  it("resumoTexto produces readable pt-BR lines with the gap", () => {
    const rec = reconciliar({ acionador: 55 });
    const linhas = resumoTexto(rec);
    expect(linhas).toContain("Acionador manual: 55 de 65 — faltam 10");
  });

  it("totals add up", () => {
    const rec = reconciliar({ acionador: 65, sirene: 65 });
    expect(rec.total_cadastrados).toBe(130);
    // total expected = sum of BOM
    expect(rec.total_esperado).toBe(264 + 14 + 32 + 65 + 65 + 64 + 30);
    expect(rec.total_faltam).toBe(rec.total_esperado - 130);
  });
});
