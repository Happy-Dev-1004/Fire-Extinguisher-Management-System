import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { AdminRecord } from "../auth/types";

const { adminFromFn } = vi.hoisted(() => ({ adminFromFn: vi.fn() }));
vi.mock("../db-admin", () => ({ supabaseAdmin: { from: adminFromFn } }));
vi.mock("../db", () => ({ supabase: { from: vi.fn() } }));
vi.mock("../logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
// Stub the seed module so the route tests don't pull real data logic.
vi.mock("../alarme/seed", () => ({ seedDispositivosAlarme: vi.fn().mockResolvedValue({ inseridos: 0, jaExistiam: 0, porTipo: {} }) }));

import alarmeRouter from "./alarme";

// ── Express test harness ────────────────────────────────────────────────────────
function findHandler(method: string, path: string) {
  const layer = (alarmeRouter as any).stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`handler ${method} ${path} não encontrado`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((b: any) => { res.body = b; return res; });
  res.send = vi.fn((b: any) => { res.body = b; return res; });
  return res as Response & { statusCode: number; body: any };
}

const OWNER: AdminRecord = { id: "a1", email: "o@x.com", nome: "O", role: "owner", ativo: true, created_at: "" };

beforeEach(() => adminFromFn.mockReset());

describe("POST /alarme/dispositivos — incremental data (null endereco/laco)", () => {
  it("creates a device with NO endereco and NO laco; cadastro_pendente=true", async () => {
    const inserted = {
      id: "d1", central_id: "11111111-1111-1111-1111-111111111111",
      tipo_dispositivo: "acionador", setor: "Catraca Portaria",
      endereco: null, laco: null, cadastro_pendente: true,
    };
    adminFromFn.mockImplementation((table: string) => {
      if (table === "centrais") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: inserted.central_id }, error: null }) }) }) };
      }
      // dispositivos_alarme insert chain
      return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: inserted, error: null }) }) }) };
    });

    const handler = findHandler("post", "/dispositivos");
    const req = { body: { central_id: inserted.central_id, tipo_dispositivo: "acionador", setor: "Catraca Portaria" }, admin: OWNER } as unknown as Request;
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.endereco).toBeNull();
    expect(res.body.laco).toBeNull();
    expect(res.body.cadastro_pendente).toBe(true);
  });

  it("rejects an invalid tipo_dispositivo (zod 400)", async () => {
    const handler = findHandler("post", "/dispositivos");
    const req = { body: { central_id: "11111111-1111-1111-1111-111111111111", tipo_dispositivo: "lampada", setor: "X" }, admin: OWNER } as unknown as Request;
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing setor (zod 400)", async () => {
    const handler = findHandler("post", "/dispositivos");
    const req = { body: { central_id: "11111111-1111-1111-1111-111111111111", tipo_dispositivo: "sirene" }, admin: OWNER } as unknown as Request;
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /alarme/dispositivos — filters", () => {
  function captureQuery() {
    const calls: Record<string, any> = {};
    const chain: any = {
      eq:    vi.fn((k: string, v: any) => { calls[`eq:${k}`] = v; return chain; }),
      ilike: vi.fn((k: string, v: any) => { calls[`ilike:${k}`] = v; return chain; }),
      order: vi.fn(() => chain),
      then:  (resolve: any) => resolve({ data: [], error: null }),
    };
    return { chain, calls };
  }

  it("applies tipo + setor + status filters to the query", async () => {
    const { chain, calls } = captureQuery();
    adminFromFn.mockImplementation((table: string) => {
      if (table === "dispositivos_alarme") return { select: () => chain };
      return {};
    });

    const handler = findHandler("get", "/dispositivos");
    const req = { query: { tipo_dispositivo: "sirene", setor: "Caldeira", status_instalacao: "pendente" } } as unknown as Request;
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(calls["eq:tipo_dispositivo"]).toBe("sirene");
    expect(calls["ilike:setor"]).toBe("%Caldeira%");
    expect(calls["eq:status_instalacao"]).toBe("pendente");
  });

  it("rejects an invalid status filter (zod 400)", async () => {
    const handler = findHandler("get", "/dispositivos");
    const req = { query: { status_instalacao: "quebrado" } } as unknown as Request;
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /alarme/seed — owner only", () => {
  it("rejects a member with 403", async () => {
    const handler = findHandler("post", "/seed");
    const req = { admin: { ...OWNER, role: "member" } } as unknown as Request;
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /alarme/reconciliacao", () => {
  it("counts active devices by type and returns the gap report", async () => {
    adminFromFn.mockImplementation((table: string) => {
      if (table === "dispositivos_alarme") {
        return { select: () => ({ eq: () => Promise.resolve({
          data: [
            ...Array(55).fill({ tipo_dispositivo: "acionador" }),
            ...Array(56).fill({ tipo_dispositivo: "sirene" }),
          ], error: null }) }) };
      }
      return {};
    });

    const handler = findHandler("get", "/reconciliacao");
    const res = mockRes();
    await handler({} as Request, res);

    expect(res.statusCode).toBe(200);
    const acion = res.body.linhas.find((l: any) => l.tipo === "acionador");
    expect(acion.cadastrados).toBe(55);
    expect(acion.faltam).toBe(10);
    expect(res.body.resumo).toContain("Acionador manual: 55 de 65 — faltam 10");
    expect(res.body.resumo).toContain("Sirene: 56 de 65 — faltam 9");
    expect(res.body.resumo).toContain("Módulo de supervisão: 0 de 64 — faltam 64");
    expect(res.body.resumo).toContain("Isolador: 0 de 30 — faltam 30");
  });
});
