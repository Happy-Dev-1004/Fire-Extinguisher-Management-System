import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromFn, registrarFn } = vi.hoisted(() => ({ fromFn: vi.fn(), registrarFn: vi.fn().mockResolvedValue("n1") }));

vi.mock("../db-admin", () => ({ supabaseAdmin: { from: fromFn, rpc: vi.fn() } }));
vi.mock("../logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("../segredos/getSecret", () => ({ getSecret: vi.fn().mockResolvedValue("") }));
vi.mock("./notificacoes", () => ({ registrarNotificacao: registrarFn }));

import { ehFalhaCriticaOpenAI, alertarZApiDesconectado } from "./saude";

// Wires supabaseAdmin.from("alertas_estado") for jaAlertou (.select().eq().maybeSingle())
// + marcarAlerta (.upsert()). `ultimoDisparo` controls the cooldown state.
function wireAlertas(ultimoDisparo: string | null) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  fromFn.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: ultimoDisparo ? { ultimo_disparo: ultimoDisparo } : null }) }) }),
    upsert,
  }));
  return { upsert };
}

describe("alertarZApiDesconectado", () => {
  beforeEach(() => { fromFn.mockReset(); registrarFn.mockClear(); });

  it("fires a critical owner alert when not in cooldown", async () => {
    const { upsert } = wireAlertas(null); // never alerted before
    await alertarZApiDesconectado();
    expect(registrarFn).toHaveBeenCalledTimes(1);
    expect(registrarFn).toHaveBeenCalledWith(expect.objectContaining({
      severidade: "critico", escopo: "owner",
      metadata: expect.objectContaining({ servico: "zapi", motivo: "desconectado" }),
    }));
    expect(upsert).toHaveBeenCalled(); // marked so it won't re-spam
  });

  it("is de-duplicated while still within the cooldown window", async () => {
    wireAlertas(new Date().toISOString()); // just alerted
    await alertarZApiDesconectado();
    expect(registrarFn).not.toHaveBeenCalled();
  });
});

describe("ehFalhaCriticaOpenAI", () => {
  it("treats 401 (bad key) as critical", () => {
    expect(ehFalhaCriticaOpenAI({ status: 401 })).toBe(true);
  });
  it("treats 429 (quota) as critical", () => {
    expect(ehFalhaCriticaOpenAI({ status: 429 })).toBe(true);
  });
  it("treats insufficient_quota code as critical", () => {
    expect(ehFalhaCriticaOpenAI({ code: "insufficient_quota" })).toBe(true);
    expect(ehFalhaCriticaOpenAI({ error: { code: "insufficient_quota" } })).toBe(true);
  });
  it("treats invalid_api_key as critical", () => {
    expect(ehFalhaCriticaOpenAI({ code: "invalid_api_key" })).toBe(true);
  });
  it("does NOT treat a transient 500 / network error as critical", () => {
    expect(ehFalhaCriticaOpenAI({ status: 500 })).toBe(false);
    expect(ehFalhaCriticaOpenAI({ message: "socket hang up" })).toBe(false);
    expect(ehFalhaCriticaOpenAI({})).toBe(false);
  });
});
