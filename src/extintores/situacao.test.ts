import { describe, it, expect, vi, afterEach } from "vitest";
import { parsearVencimento, calcularSituacao } from "./situacao";

// ── parsearVencimento ─────────────────────────────────────────────────────────

describe("parsearVencimento", () => {
  it("parses 'nov/26' as end-of-November 2026", () => {
    const d = parsearVencimento("nov/26", "test");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(10); // 0-based: November = 10
    expect(d!.getDate()).toBe(30);  // last day of November
  });

  it("parses 'jan/2030' (4-digit year)", () => {
    const d = parsearVencimento("jan/2030", "test");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2030);
    expect(d!.getMonth()).toBe(0);
    expect(d!.getDate()).toBe(31);
  });

  it("parses 'dez/99' as end-of-December 2099", () => {
    const d = parsearVencimento("dez/99", "test");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2099);
    expect(d!.getMonth()).toBe(11);
  });

  it("returns null for empty string", () => {
    expect(parsearVencimento("", "test")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(parsearVencimento(null, "test")).toBeNull();
    expect(parsearVencimento(undefined, "test")).toBeNull();
  });

  it("returns null for garbage string without crashing", () => {
    expect(parsearVencimento("not-a-date", "test")).toBeNull();
    expect(parsearVencimento("13/26", "test")).toBeNull(); // invalid month abbrev
    expect(parsearVencimento("abc", "test")).toBeNull();
  });

  it("parses '04/2026' (numeric MM/YYYY)", () => {
    const d = parsearVencimento("04/2026", "test");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3); // April = 3
    expect(d!.getDate()).toBe(30);
  });

  it("parses '18/08/2026' (DD/MM/YYYY — day ignored)", () => {
    const d = parsearVencimento("18/08/2026", "test");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(7); // August = 7
    expect(d!.getDate()).toBe(31);
  });

  it("parses '2029' (year only → end of December)", () => {
    const d = parsearVencimento("2029", "test");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2029);
    expect(d!.getMonth()).toBe(11); // December = 11
    expect(d!.getDate()).toBe(31);
  });

  it("all 12 pt-BR abbreviations parse without error", () => {
    const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    for (const m of meses) {
      const d = parsearVencimento(`${m}/30`, "test");
      expect(d, `${m}/30 should parse`).not.toBeNull();
    }
  });
});

// ── calcularSituacao ──────────────────────────────────────────────────────────

function anoStr(delta: number): string {
  const y = new Date().getFullYear() + delta;
  // two-digit for <=2099, otherwise four
  const s = String(y).slice(-2);
  return `jan/${s}`;
}

describe("calcularSituacao", () => {
  afterEach(() => vi.useRealTimers());

  it("returns 'descartado' when status_ativo is false", () => {
    expect(calcularSituacao({ status_ativo: false, vencimento_carga: "jan/30", vencimento_teste: "jan/30" }))
      .toBe("descartado");
  });

  it("returns 'vencido' when vencimento_carga is in the past", () => {
    // past year: current year - 1
    const past = `jan/${String(new Date().getFullYear() - 1).slice(-2)}`;
    expect(calcularSituacao({ status_ativo: true, vencimento_carga: past, vencimento_teste: "jan/99" }))
      .toBe("vencido");
  });

  it("returns 'vencido' when vencimento_teste is in the past", () => {
    const past = `jan/${String(new Date().getFullYear() - 1).slice(-2)}`;
    expect(calcularSituacao({ status_ativo: true, vencimento_carga: "jan/99", vencimento_teste: past }))
      .toBe("vencido");
  });

  it("returns 'proximo' when a vencimento is 20 days out", () => {
    // fake today so we can set an exact date 20 days ahead
    const now = new Date(2026, 0, 1); // 2026-01-01
    vi.useFakeTimers();
    vi.setSystemTime(now);
    // jan/26 ends 2026-01-31 → 30 days from 2026-01-01 → within 60-day window
    expect(calcularSituacao({ status_ativo: true, vencimento_carga: "jan/26", vencimento_teste: "jan/99" }))
      .toBe("proximo");
  });

  it("returns 'em_dia' when vencimento is 200 days out", () => {
    const now = new Date(2026, 0, 1); // 2026-01-01
    vi.useFakeTimers();
    vi.setSystemTime(now);
    // ago/26 ends 2026-08-31 → ~242 days away → beyond 60-day window
    expect(calcularSituacao({ status_ativo: true, vencimento_carga: "ago/26", vencimento_teste: "ago/26" }))
      .toBe("em_dia");
  });

  it("returns 'indeterminado' when both vencimentos are missing", () => {
    expect(calcularSituacao({ status_ativo: true, vencimento_carga: null, vencimento_teste: null }))
      .toBe("indeterminado");
  });

  it("returns 'indeterminado' without crashing when both vencimentos are garbage", () => {
    expect(calcularSituacao({ status_ativo: true, vencimento_carga: "???", vencimento_teste: "???" }))
      .toBe("indeterminado");
  });

  it("uses a single valid vencimento when the other is missing", () => {
    const past = `jan/${String(new Date().getFullYear() - 1).slice(-2)}`;
    // carga missing, teste in past → vencido
    expect(calcularSituacao({ status_ativo: true, vencimento_carga: null, vencimento_teste: past }))
      .toBe("vencido");
  });
});
