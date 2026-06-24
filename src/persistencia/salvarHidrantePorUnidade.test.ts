import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromFn, rpcFn, resolverFn, totalFn } = vi.hoisted(() => ({
  fromFn: vi.fn(), rpcFn: vi.fn(), resolverFn: vi.fn(), totalFn: vi.fn(),
}));

vi.mock("../db-admin", () => ({ supabaseAdmin: { from: fromFn, rpc: rpcFn } }));
vi.mock("../logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("../regioes/unidadesHidrante", () => ({
  resolverNomeUnidadeHidrante: resolverFn,
  totalDaUnidadeHidrante: totalFn,
}));

import { salvarHidrantePorUnidade } from "./salvarHidrantePorUnidade";

// Captures inserts into inspecoes_pendentes_hidrante and stubs the hidrantes
// label-lookup select. `slots` are the unit's stored display numbers used by the
// label fallback (resolverNumeroIntPorRotulo).
function wireParkCapture(slots: { numero: string; numero_int: number }[] = []) {
  const parked: any[] = [];
  fromFn.mockImplementation((table: string) => {
    if (table === "inspecoes_pendentes_hidrante") {
      return { insert: (row: any) => { parked.push(row); return Promise.resolve({ error: null }); } };
    }
    if (table === "hidrantes") {
      // .select("numero, numero_int").eq("unidade", X) → { data }
      return { select: () => ({ eq: () => Promise.resolve({ data: slots }) }) };
    }
    return {};
  });
  return parked;
}

const baseResultado: any = {
  numero_hidrante: "5", unidade: "EDP", setor: "Portaria", inspetor: "Rodrigo",
  c_esguicho: "OK", c_condicoes_caixa: "OK", c_condicoes_acesso: "OK",
  c_identificacao_piso: "OK", c_identificacao_placa: "OK", c_mangueira: "OK",
  c_adaptador: "OK", c_chave_storz: "OK", c_teste: "OK", c_tampa_hidrante: "OK",
  status_geral: "", observacoes: "", confianca: 0.9,
};

beforeEach(() => { fromFn.mockReset(); rpcFn.mockReset(); resolverFn.mockReset(); totalFn.mockReset(); });

describe("salvarHidrantePorUnidade", () => {
  it("applies to the slot when unit + number are valid", async () => {
    resolverFn.mockResolvedValue("EDP");
    totalFn.mockResolvedValue(10);
    rpcFn.mockResolvedValue({ data: "slot-uuid", error: null });

    const r = await salvarHidrantePorUnidade({
      resultado: baseResultado, loteId: "l1", fotos: ["u"], unidadeContexto: "edp", numeroLegenda: "5",
    });
    expect(r.tipo).toBe("aplicado");
    if (r.tipo === "aplicado") { expect(r.unidade).toBe("EDP"); expect(r.numero).toBe(5); }
    // RPC called with the unit + parsed number + checklist (no constants).
    expect(rpcFn).toHaveBeenCalledWith("aplicar_inspecao_hidrante", expect.objectContaining({
      p_unidade: "EDP", p_numero_int: 5, p_c_esguicho: "OK",
    }));
  });

  it("parks when the unit is unknown", async () => {
    resolverFn.mockResolvedValue(null);
    const parked = wireParkCapture();
    const r = await salvarHidrantePorUnidade({
      resultado: baseResultado, loteId: "l1", fotos: ["u"], unidadeContexto: "???", numeroLegenda: "5",
    });
    expect(r.tipo).toBe("pendente");
    expect(parked).toHaveLength(1);
    expect(rpcFn).not.toHaveBeenCalled();
  });

  it("parks when the number is out of range", async () => {
    resolverFn.mockResolvedValue("EDP");
    totalFn.mockResolvedValue(10);
    const parked = wireParkCapture();
    const r = await salvarHidrantePorUnidade({
      resultado: { ...baseResultado, numero_hidrante: "99" }, loteId: "l1", fotos: ["u"], unidadeContexto: "EDP", numeroLegenda: "99",
    });
    expect(r.tipo).toBe("pendente");
    if (r.tipo === "pendente") expect(r.motivo).toContain("fora do intervalo");
    expect(parked).toHaveLength(1);
  });

  it("tolerates an 'H01'-style number (strips the H)", async () => {
    resolverFn.mockResolvedValue("EDP");
    totalFn.mockResolvedValue(10);
    rpcFn.mockResolvedValue({ data: "slot-uuid", error: null });
    const r = await salvarHidrantePorUnidade({
      resultado: baseResultado, loteId: "l1", fotos: ["u"], unidadeContexto: "EDP", numeroLegenda: "H01",
    });
    expect(r.tipo).toBe("aplicado");
    if (r.tipo === "aplicado") expect(r.numero).toBe(1);
  });

  it("resolves a custom display label (CW Ilhéus 'H11-1') to its numero_int", async () => {
    resolverFn.mockResolvedValue("CW Ilhéus");
    totalFn.mockResolvedValue(20);
    rpcFn.mockResolvedValue({ data: "slot-uuid", error: null });
    // "H11-1" parses to integer 11, which is in range 1..20 — but slot 11's
    // printed numero IS "H11-1", so the straight integer is correct here. Use
    // "H11-2" (parses to a malformed 11-2 → integer fails) to exercise the
    // label fallback → numero_int 12.
    wireParkCapture([
      { numero: "H11-1", numero_int: 11 },
      { numero: "H11-2", numero_int: 12 },
    ]);
    const r = await salvarHidrantePorUnidade({
      resultado: baseResultado, loteId: "l1", fotos: ["u"], unidadeContexto: "CW Ilhéus", numeroLegenda: "H11-2",
    });
    expect(r.tipo).toBe("aplicado");
    if (r.tipo === "aplicado") expect(r.numero).toBe(12);
    expect(rpcFn).toHaveBeenCalledWith("aplicar_inspecao_hidrante", expect.objectContaining({
      p_unidade: "CW Ilhéus", p_numero_int: 12,
    }));
  });
});
