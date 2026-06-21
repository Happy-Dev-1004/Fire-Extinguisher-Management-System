import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake of the notificacoes table to test collapse + insert behaviour.
const { fromFn, store } = vi.hoisted(() => {
  const store: { rows: any[] } = { rows: [] };
  const fromFn = vi.fn();
  return { fromFn, store };
});

vi.mock("../db-admin", () => ({ supabaseAdmin: { from: fromFn } }));
vi.mock("../logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
// The critical fan-out lazy-imports these; stub them so the test stays isolated.
vi.mock("./enviarEmailSimples", () => ({ enviarEmailSimples: vi.fn().mockResolvedValue(true) }));
vi.mock("../segredos/getSecret", () => ({ getSecret: vi.fn().mockResolvedValue("") }));
vi.mock("./zapi", () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue(true) }));

import { registrarNotificacao } from "./notificacoes";

// Builds a chainable mock for the notificacoes table backed by `store.rows`.
function wireNotificacoes() {
  store.rows = [];
  let seq = 0;
  fromFn.mockImplementation((table: string) => {
    if (table !== "notificacoes") {
      // admins lookup (owner) etc. — return empty
      return {
        select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }),
      };
    }
    return {
      // collapse lookup: .select().eq('grupo_chave').eq('lida',false).maybeSingle()
      select: () => ({
        eq: (k1: string, v1: any) => ({
          eq: (_k2: string, _v2: any) => ({
            maybeSingle: () => {
              const row = store.rows.find((r) => r.grupo_chave === v1 && r.lida === false);
              return Promise.resolve({ data: row ?? null, error: null });
            },
          }),
        }),
      }),
      // update: .update(patch).eq('id', id)
      update: (patch: any) => ({
        eq: (_k: string, id: string) => {
          const row = store.rows.find((r) => r.id === id);
          if (row) Object.assign(row, patch);
          return Promise.resolve({ data: null, error: null });
        },
      }),
      // insert: .insert(row).select('id').single()
      insert: (row: any) => ({
        select: () => ({
          single: () => {
            const novo = { id: `n${++seq}`, contador: 1, lida: false, ...row };
            store.rows.push(novo);
            return Promise.resolve({ data: { id: novo.id }, error: null });
          },
        }),
      }),
    };
  });
}

beforeEach(() => { fromFn.mockReset(); wireNotificacoes(); });

describe("registrarNotificacao", () => {
  it("inserts a notification and returns its id", async () => {
    const id = await registrarNotificacao({ tipo: "sessao", titulo: "Herucles iniciou inspeção" });
    expect(id).toBe("n1");
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].titulo).toBe("Herucles iniciou inspeção");
    expect(store.rows[0].severidade).toBe("info");
    expect(store.rows[0].escopo).toBe("admin");
  });

  it("collapses repeated photo events onto one row (contador increments)", async () => {
    const chave = "foto:73988020347:Barry Itabuna";
    await registrarNotificacao({ tipo: "foto", titulo: "1 foto", grupoChave: chave });
    await registrarNotificacao({ tipo: "foto", titulo: "2 fotos", grupoChave: chave });
    await registrarNotificacao({ tipo: "foto", titulo: "3 fotos", grupoChave: chave });

    expect(store.rows).toHaveLength(1);            // one rolling row, not three
    expect(store.rows[0].contador).toBe(3);        // folded count
    expect(store.rows[0].titulo).toBe("3 fotos");  // latest title wins
  });

  it("does NOT collapse once the group row has been read (starts a fresh one)", async () => {
    const chave = "foto:x:Ilheus";
    await registrarNotificacao({ tipo: "foto", titulo: "a", grupoChave: chave });
    store.rows[0].lida = true;                      // user read it
    await registrarNotificacao({ tipo: "foto", titulo: "b", grupoChave: chave });
    expect(store.rows).toHaveLength(2);             // a fresh open row
  });

  it("marks owner scope for health alerts", async () => {
    await registrarNotificacao({ tipo: "saude", severidade: "critico", escopo: "owner", titulo: "OpenAI parado" });
    expect(store.rows[0].escopo).toBe("owner");
    expect(store.rows[0].severidade).toBe("critico");
  });
});
