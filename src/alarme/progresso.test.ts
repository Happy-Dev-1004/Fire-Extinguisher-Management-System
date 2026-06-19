import { describe, it, expect } from "vitest";
import { agregarProgresso, type DispositivoProgresso } from "./progresso";

function disp(p: Partial<DispositivoProgresso>): DispositivoProgresso {
  return {
    central_numero: 3, central_nome: "Fábrica", laco: 1,
    tipo_dispositivo: "sirene", status_instalacao: "pendente", ...p,
  };
}

describe("agregarProgresso", () => {
  it("counts status per central and per loop", () => {
    const devs = [
      disp({ central_numero: 3, laco: 1, status_instalacao: "instalado" }),
      disp({ central_numero: 3, laco: 1, status_instalacao: "testado" }),
      disp({ central_numero: 3, laco: 2, status_instalacao: "pendente" }),
      disp({ central_numero: 1, laco: 1, status_instalacao: "enderecado", central_nome: "Portaria" }),
    ];
    const r = agregarProgresso(devs, { sirene: 4 });

    expect(r.geral.total).toBe(4);
    expect(r.geral.instalado).toBe(1);
    expect(r.geral.testado).toBe(1);
    expect(r.geral.pendente).toBe(1);
    expect(r.geral.enderecado).toBe(1);

    // centrais ordered by numero (1 before 3)
    expect(r.centrais.map((c) => c.central_numero)).toEqual([1, 3]);

    const c3 = r.centrais.find((c) => c.central_numero === 3)!;
    expect(c3.contagem.total).toBe(3);
    expect(c3.lacos.map((l) => l.laco)).toEqual([1, 2]);
    const c3l1 = c3.lacos.find((l) => l.laco === 1)!;
    expect(c3l1.contagem.total).toBe(2);
    expect(c3l1.contagem.instalado).toBe(1);
    expect(c3l1.contagem.testado).toBe(1);
  });

  it("computes pct_instalado (instalado+enderecado+testado) and pct_testado", () => {
    const devs = [
      disp({ status_instalacao: "pendente" }),
      disp({ status_instalacao: "instalado" }),
      disp({ status_instalacao: "enderecado" }),
      disp({ status_instalacao: "testado" }),
    ];
    const r = agregarProgresso(devs, {});
    expect(r.geral.pct_instalado).toBe(75); // 3/4
    expect(r.geral.pct_testado).toBe(25);   // 1/4
  });

  it("never crashes on incomplete data: null central, null laço, unknown status", () => {
    const devs = [
      disp({ central_numero: null, central_nome: null, laco: null, status_instalacao: null }),
      disp({ central_numero: 3, laco: null, status_instalacao: "estado_desconhecido" as any }),
    ];
    const r = agregarProgresso(devs, {});
    expect(r.geral.total).toBe(2);
    // both unknown/null statuses fall back to pendente — nothing dropped
    expect(r.geral.pendente).toBe(2);

    // "sem central" sorts last
    const semCentral = r.centrais.find((c) => c.central_numero == null)!;
    expect(semCentral).toBeTruthy();
    expect(semCentral.lacos[0].laco).toBeNull(); // "sem laço" bucket
    expect(r.centrais[r.centrais.length - 1].central_numero).toBeNull();
  });

  it("includes BOM reconciliation gaps so missing data is visible", () => {
    // only 5 of 264 smoke detectors registered
    const devs = Array.from({ length: 5 }, () => disp({ tipo_dispositivo: "detector_fumaca", status_instalacao: "instalado" }));
    const r = agregarProgresso(devs, { detector_fumaca: 5 });

    const linha = r.reconciliacao.linhas.find((l) => l.tipo === "detector_fumaca")!;
    expect(linha.cadastrados).toBe(5);
    expect(linha.esperado).toBe(264);
    expect(linha.faltam).toBe(259);
    expect(r.total_esperado).toBe(534); // sum of the BOM
  });

  it("returns empty-but-valid structure for zero devices", () => {
    const r = agregarProgresso([], {});
    expect(r.geral.total).toBe(0);
    expect(r.geral.pct_instalado).toBe(0);
    expect(r.centrais).toEqual([]);
    // BOM still shows the full expected universe as gaps
    expect(r.reconciliacao.total_faltam).toBe(534);
  });
});
