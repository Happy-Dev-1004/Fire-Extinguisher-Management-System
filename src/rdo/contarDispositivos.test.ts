import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromFn } = vi.hoisted(() => ({ fromFn: vi.fn() }));

vi.mock("../db-admin", () => ({ supabaseAdmin: { from: fromFn } }));
vi.mock("../notificacao/zapi", () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock("../fotos/storage", () => ({ uploadFotoUrl: vi.fn() }));
vi.mock("../notificacao/notificacoes", () => ({ registrarNotificacao: vi.fn() }));
vi.mock("../logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));

import { contarDispositivosInstaladosNoDia } from "./deps";

// Builds a thenable query object (each filter returns `this`) whose final result
// is `{ data }`. Mirrors the supabase-js query builder used by the helper.
function wireDispositivos(rows: { tipo_dispositivo: string }[], centralRow: any = { id: "c-uuid" }) {
  const calls: Record<string, any> = {};
  fromFn.mockImplementation((table: string) => {
    if (table === "centrais") {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: centralRow }) }) }) };
    }
    // dispositivos_alarme: select().eq().eq()[.eq()] → thenable resolving to {data:rows}
    const q: any = {
      _eq: {} as Record<string, unknown>,
      select() { return this; },
      eq(col: string, val: unknown) { this._eq[col] = val; calls[col] = val; return this; },
      then(res: (v: any) => void) { res({ data: rows, error: null }); },
    };
    return q;
  });
  return calls;
}

beforeEach(() => { fromFn.mockReset(); });

describe("contarDispositivosInstaladosNoDia", () => {
  it("groups installed devices by type for the given date", async () => {
    wireDispositivos([
      { tipo_dispositivo: "detector_fumaca" },
      { tipo_dispositivo: "detector_fumaca" },
      { tipo_dispositivo: "sirene" },
    ]);
    const r = await contarDispositivosInstaladosNoDia("2026-07-10");
    expect(r).toEqual({ detector_fumaca: 2, sirene: 1 });
  });

  it("returns {} when no date is provided (never queries)", async () => {
    const r = await contarDispositivosInstaladosNoDia(null);
    expect(r).toEqual({});
    expect(fromFn).not.toHaveBeenCalled();
  });

  it("scopes to a central when the RDO central text carries a number", async () => {
    const calls = wireDispositivos([{ tipo_dispositivo: "acionador" }]);
    const r = await contarDispositivosInstaladosNoDia("2026-07-10", "Central 3");
    expect(r).toEqual({ acionador: 1 });
    // filtered by the resolved central id + the date
    expect(calls.central_id).toBe("c-uuid");
    expect(calls.data_instalacao).toBe("2026-07-10");
  });

  it("returns {} for a date with no installs", async () => {
    wireDispositivos([]);
    const r = await contarDispositivosInstaladosNoDia("2026-07-10");
    expect(r).toEqual({});
  });
});
