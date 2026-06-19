import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger and db-admin before importing the seed.
const { fromFn } = vi.hoisted(() => ({ fromFn: vi.fn() }));
vi.mock("../logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("../db-admin", () => ({ supabaseAdmin: { from: fromFn } }));

import { seedDispositivosAlarme } from "./seed";
import { ACIONADORES, SIRENES } from "./seedData";

const QTD_ACIONADORES = ACIONADORES.reduce((s, x) => s + x.quantidade, 0); // 55
const QTD_SIRENES     = SIRENES.reduce((s, x) => s + x.quantidade, 0);     // 56
const QTD_KNOWN       = QTD_ACIONADORES + QTD_SIRENES;

const CENTRAIS = [
  { id: "c1", numero: 1 }, { id: "c2", numero: 2 },
  { id: "c3", numero: 3 }, { id: "c4", numero: 4 },
];

// Builds a stateful mock: `existing` is the set of seed_keys already in the DB.
// Captures every upserted row so we can assert no duplicates.
function mockDb(existing: Set<string>) {
  const upserted: any[] = [];
  fromFn.mockImplementation((table: string) => {
    if (table === "centrais") {
      return { select: () => Promise.resolve({ data: CENTRAIS, error: null }) };
    }
    // dispositivos_alarme
    return {
      select: () => ({
        not: () => Promise.resolve({
          data: [...existing].map((seed_key) => ({ seed_key })),
          error: null,
        }),
      }),
      insert: (rows: any[]) => {
        upserted.push(...rows);
        for (const r of rows) existing.add(r.seed_key); // simulate persistence
        return Promise.resolve({ error: null });
      },
    };
  });
  return { upserted };
}

describe("seedDispositivosAlarme — idempotent", () => {
  beforeEach(() => fromFn.mockReset());

  it("first run inserts all known devices; SECOND run inserts nothing (no duplicates)", async () => {
    const existing = new Set<string>();

    const { upserted } = mockDb(existing);
    const r1 = await seedDispositivosAlarme();
    expect(r1.inseridos).toBe(QTD_KNOWN);
    expect(r1.jaExistiam).toBe(0);
    expect(upserted.length).toBe(QTD_KNOWN);

    // Re-run against the now-populated set.
    const { upserted: upserted2 } = mockDb(existing);
    const r2 = await seedDispositivosAlarme();
    expect(r2.inseridos).toBe(0);           // nothing new
    expect(r2.jaExistiam).toBe(QTD_KNOWN);
    expect(upserted2.length).toBe(0);        // no rows written the second time
  });

  it("every seeded device has endereco/laco NULL and cadastro_pendente true (awaiting addressing)", async () => {
    const { upserted } = mockDb(new Set());
    await seedDispositivosAlarme();
    expect(upserted.every((d) => d.endereco === null)).toBe(true);
    expect(upserted.every((d) => d.laco === null)).toBe(true);
    expect(upserted.every((d) => d.cadastro_pendente === true)).toBe(true);
    expect(upserted.every((d) => typeof d.seed_key === "string")).toBe(true);
  });

  it("seed counts match the BOM partials we have (acionadores 55, sirenes 56)", async () => {
    const { upserted } = mockDb(new Set());
    await seedDispositivosAlarme();
    const acion = upserted.filter((d) => d.tipo_dispositivo === "acionador").length;
    const sir   = upserted.filter((d) => d.tipo_dispositivo === "sirene").length;
    expect(acion).toBe(55);
    expect(sir).toBe(56);
  });

  it("seed_keys are unique (no internal collision)", async () => {
    const { upserted } = mockDb(new Set());
    await seedDispositivosAlarme();
    const keys = upserted.map((d) => d.seed_key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
