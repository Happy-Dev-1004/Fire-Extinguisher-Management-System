import { describe, it, expect, vi, beforeEach } from "vitest";

const { orderFn } = vi.hoisted(() => ({ orderFn: vi.fn() }));

vi.mock("../db-admin", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ order: orderFn }) }) },
}));

import {
  classificarUnidadeHidrante,
  resolverNomeUnidadeHidrante,
  limparCacheUnidadesHidrante,
} from "./unidadesHidrante";

const UNIDADES = [
  { nome: "Fábrica Ilhéus", total_hidrantes: 43, ordem: 1 },
  { nome: "Fábrica Itabuna", total_hidrantes: 0, ordem: 2 },
  { nome: "CW Ilhéus", total_hidrantes: 20, ordem: 3 },
  { nome: "CW Itabuna", total_hidrantes: 12, ordem: 4 },
];

beforeEach(() => {
  limparCacheUnidadesHidrante();
  orderFn.mockReset();
  orderFn.mockResolvedValue({ data: UNIDADES });
});

describe("classificarUnidadeHidrante", () => {
  it("resolves an exact unit name (accent-insensitive)", async () => {
    expect(await classificarUnidadeHidrante("CW Ilhéus")).toEqual({ tipo: "exata", nome: "CW Ilhéus" });
    expect(await classificarUnidadeHidrante("cw ilheus")).toEqual({ tipo: "exata", nome: "CW Ilhéus" });
    expect(await classificarUnidadeHidrante("fabrica itabuna")).toEqual({ tipo: "exata", nome: "Fábrica Itabuna" });
  });

  it("flags a bare city as ambiguous (the reported bug: 'Ilhéus')", async () => {
    const c = await classificarUnidadeHidrante("Ilhéus");
    expect(c.tipo).toBe("ambigua");
    if (c.tipo === "ambigua") expect(c.candidatos).toEqual(["Fábrica Ilhéus", "CW Ilhéus"]);
  });

  it("flags other shared tokens as ambiguous ('Itabuna', 'CW', 'Fabrica')", async () => {
    for (const t of ["Itabuna", "CW", "Fabrica"]) {
      expect((await classificarUnidadeHidrante(t)).tipo).toBe("ambigua");
    }
  });

  it("returns 'nenhuma' for unknown text and empty input", async () => {
    expect((await classificarUnidadeHidrante("xyz")).tipo).toBe("nenhuma");
    expect((await classificarUnidadeHidrante("")).tipo).toBe("nenhuma");
    expect((await classificarUnidadeHidrante(null)).tipo).toBe("nenhuma");
  });

  it("resolverNomeUnidadeHidrante returns a name only for an exact match", async () => {
    expect(await resolverNomeUnidadeHidrante("CW Ilhéus")).toBe("CW Ilhéus");
    expect(await resolverNomeUnidadeHidrante("Ilhéus")).toBeNull();   // ambiguous → null
    expect(await resolverNomeUnidadeHidrante("xyz")).toBeNull();
  });
});
