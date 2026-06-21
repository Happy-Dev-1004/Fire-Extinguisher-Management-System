import { describe, it, expect, vi } from "vitest";

vi.mock("../db-admin", () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("../logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("../segredos/getSecret", () => ({ getSecret: vi.fn().mockResolvedValue("") }));
vi.mock("./notificacoes", () => ({ registrarNotificacao: vi.fn().mockResolvedValue("n1") }));

import { ehFalhaCriticaOpenAI } from "./saude";

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
