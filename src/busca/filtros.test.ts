import { describe, it, expect } from "vitest";
import { FiltrosSchema, PAGE_SIZE } from "./filtros";

// ── FiltrosSchema validation ──────────────────────────────────────────────────

describe("FiltrosSchema", () => {
  it("accepts empty query (all optional)", () => {
    const r = FiltrosSchema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data!.page).toBe(1);
  });

  it("coerces page string to number", () => {
    const r = FiltrosSchema.safeParse({ page: "3" });
    expect(r.success).toBe(true);
    expect(r.data!.page).toBe(3);
  });

  it("rejects page = 0", () => {
    const r = FiltrosSchema.safeParse({ page: "0" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid situacao", () => {
    const r = FiltrosSchema.safeParse({ situacao: "invalido" });
    expect(r.success).toBe(false);
  });

  it("accepts valid situacao values", () => {
    for (const s of ["em_dia", "proximo", "vencido", "descartado", "indeterminado"] as const) {
      const r = FiltrosSchema.safeParse({ situacao: s });
      expect(r.success, `situacao ${s} should be valid`).toBe(true);
    }
  });

  it("transforms tem_irregularidade 'true' → boolean true", () => {
    const r = FiltrosSchema.safeParse({ tem_irregularidade: "true" });
    expect(r.success).toBe(true);
    expect(r.data!.tem_irregularidade).toBe(true);
  });

  it("transforms tem_irregularidade 'false' → boolean false", () => {
    const r = FiltrosSchema.safeParse({ tem_irregularidade: "false" });
    expect(r.success).toBe(true);
    expect(r.data!.tem_irregularidade).toBe(false);
  });

  it("rejects tem_irregularidade with non-boolean string", () => {
    const r = FiltrosSchema.safeParse({ tem_irregularidade: "1" });
    expect(r.success).toBe(false);
  });

  it("coerces vence_em_dias to number", () => {
    const r = FiltrosSchema.safeParse({ vence_em_dias: "60" });
    expect(r.success).toBe(true);
    expect(r.data!.vence_em_dias).toBe(60);
  });

  it("rejects vence_em_dias = 0", () => {
    const r = FiltrosSchema.safeParse({ vence_em_dias: "0" });
    expect(r.success).toBe(false);
  });

  it("rejects vence_em_dias > 3650", () => {
    const r = FiltrosSchema.safeParse({ vence_em_dias: "9999" });
    expect(r.success).toBe(false);
  });

  it("accepts all filters together", () => {
    const r = FiltrosSchema.safeParse({
      unidade: "Fábrica",
      setor: "Produção",
      numero: "A01",
      tipo_carga: "Pó",
      situacao: "vencido",
      status_geral: "Reprovado",
      tem_irregularidade: "true",
      mes_referencia: "Mai/2026",
      inspetor: "João",
      vence_em_dias: "30",
      page: "2",
    });
    expect(r.success).toBe(true);
    expect(r.data!.page).toBe(2);
    expect(r.data!.tem_irregularidade).toBe(true);
  });
});

// ── PAGE_SIZE constant ────────────────────────────────────────────────────────

describe("PAGE_SIZE", () => {
  it("is a positive integer", () => {
    expect(PAGE_SIZE).toBeGreaterThan(0);
    expect(Number.isInteger(PAGE_SIZE)).toBe(true);
  });
});
