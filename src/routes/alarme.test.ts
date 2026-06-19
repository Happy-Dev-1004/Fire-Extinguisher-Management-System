import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { AdminRecord } from "../auth/types";

const { adminFromFn, adminRpcFn } = vi.hoisted(() => ({ adminFromFn: vi.fn(), adminRpcFn: vi.fn() }));
vi.mock("../db-admin", () => ({ supabaseAdmin: { from: adminFromFn, rpc: adminRpcFn } }));
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

beforeEach(() => { adminFromFn.mockReset(); adminRpcFn.mockReset(); });

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

describe("GET /alarme/dispositivos-instalados — RDO photo-record link", () => {
  it("returns devices installed on the date, each with gallery links", async () => {
    const calls: Record<string, any> = {};
    const chain: any = {
      eq: vi.fn((k: string, v: any) => { calls[`eq:${k}`] = v; return chain; }),
      order: vi.fn(() => chain),
      then: (resolve: any) => resolve({
        data: [
          { id: "d1", central_id: "c3", laco: 1, endereco: "L1.05", tipo_dispositivo: "sirene",
            setor: "Torrefação", status_instalacao: "instalado", data_instalacao: "2026-06-18",
            fotos: ["https://s/1.jpg", "https://s/2.jpg"] },
          { id: "d2", central_id: "c3", laco: 1, endereco: "L1.06", tipo_dispositivo: "acionador",
            setor: "Torrefação", status_instalacao: "instalado", data_instalacao: "2026-06-18", fotos: [] },
        ],
        error: null,
      }),
    };
    adminFromFn.mockImplementation((table: string) => {
      if (table === "centrais") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "c3" }, error: null }) }) }) };
      }
      if (table === "dispositivos_alarme") return { select: () => chain };
      return {};
    });

    const handler = findHandler("get", "/dispositivos-instalados");
    const req = { query: { data: "2026-06-18", central_numero: "3" } } as unknown as Request;
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
    expect(calls["eq:data_instalacao"]).toBe("2026-06-18");
    expect(calls["eq:central_id"]).toBe("c3");
    expect(res.body.dispositivos[0].link_galeria).toBe("/alarme/dispositivos/d1");
    expect(res.body.dispositivos[0].qtd_fotos).toBe(2);
    expect(res.body.dispositivos[1].qtd_fotos).toBe(0);
  });

  it("rejects a missing/invalid date (zod 400)", async () => {
    const handler = findHandler("get", "/dispositivos-instalados");
    const req = { query: {} } as unknown as Request;
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /alarme/fotos-pendentes/:id/atribuir — resolve orphan photo", () => {
  it("appends the orphan photo to the chosen device and marks it resolved", async () => {
    adminRpcFn.mockResolvedValue({ data: [{ fotos: ["u"] }], error: null });
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
    adminFromFn.mockImplementation((table: string) => {
      if (table === "dispositivo_fotos_pendentes") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({
            data: { id: "p1", foto_url: "https://s/orphan.jpg", resolvido: false }, error: null }) }) }),
          update: () => ({ eq: updateEq }),
        };
      }
      return {};
    });

    const handler = findHandler("post", "/fotos-pendentes/:id/atribuir");
    const req = { params: { id: "p1" }, body: { dispositivo_id: "d1" }, admin: OWNER } as unknown as Request;
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(adminRpcFn).toHaveBeenCalledWith("append_foto_dispositivo", { p_id: "d1", p_foto: "https://s/orphan.jpg" });
    expect(updateEq).toHaveBeenCalled();
  });
});

describe("GET /alarme/busca — alarm device search", () => {
  it("filters by central + status and returns rows with counts", async () => {
    const calls: Record<string, any> = {};
    const chain: any = {
      eq: vi.fn((k: string, v: any) => { calls[`eq:${k}`] = v; return chain; }),
      ilike: vi.fn((k: string, v: any) => { calls[`ilike:${k}`] = v; return chain; }),
      order: vi.fn(() => chain),
      then: (resolve: any) => resolve({
        data: [
          { id: "d1", laco: 1, endereco: "L1.05", tipo_dispositivo: "sirene", setor: "Torrefação",
            status_instalacao: "testado", data_instalacao: "2026-06-18", cadastro_pendente: false,
            fotos: ["u1"], centrais: { numero: 3, nome: "Fábrica" } },
          { id: "d2", laco: 1, endereco: null, tipo_dispositivo: "sirene", setor: "Torrefação",
            status_instalacao: "pendente", data_instalacao: null, cadastro_pendente: true,
            fotos: [], centrais: { numero: 3, nome: "Fábrica" } },
        ],
        error: null,
      }),
    };
    adminFromFn.mockImplementation((table: string) => {
      if (table === "centrais") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "c3" }, error: null }) }) }) };
      }
      if (table === "dispositivos_alarme") return { select: () => chain };
      return {};
    });

    const handler = findHandler("get", "/busca");
    const req = { query: { central_numero: "3", status_instalacao: "testado" } } as unknown as Request;
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(calls["eq:central_id"]).toBe("c3");
    expect(calls["eq:status_instalacao"]).toBe("testado");
    expect(res.body.total).toBe(2);
    expect(res.body.contagens.testado).toBe(1);
    expect(res.body.contagens.pendente).toBe(1);
    expect(res.body.contagens.cadastro_pendente).toBe(1);
    // labels + computed fields present
    expect(res.body.resultados[0].tipo_label).toBe("Sirene");
    expect(res.body.resultados[0].status_label).toBe("Testado");
    expect(res.body.resultados[0].qtd_fotos).toBe(1);
  });

  it("rejects an invalid status filter (zod 400)", async () => {
    const handler = findHandler("get", "/busca");
    const req = { query: { status_instalacao: "explodido" } } as unknown as Request;
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /alarme/progresso — install progress", () => {
  it("aggregates counts per central and includes BOM gaps", async () => {
    adminFromFn.mockImplementation((table: string) => {
      if (table === "dispositivos_alarme") {
        return { select: () => ({ eq: () => Promise.resolve({
          data: [
            { tipo_dispositivo: "sirene", status_instalacao: "instalado", laco: 1, centrais: { numero: 3, nome: "Fábrica" } },
            { tipo_dispositivo: "sirene", status_instalacao: "testado",   laco: 1, centrais: { numero: 3, nome: "Fábrica" } },
            { tipo_dispositivo: "acionador", status_instalacao: "pendente", laco: null, centrais: { numero: 1, nome: "Portaria" } },
          ], error: null }) }) };
      }
      return {};
    });

    const handler = findHandler("get", "/progresso");
    const res = mockRes();
    await handler({} as Request, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.geral.total).toBe(3);
    expect(res.body.geral.instalado).toBe(1);
    expect(res.body.geral.testado).toBe(1);
    expect(res.body.centrais.map((c: any) => c.central_numero)).toEqual([1, 3]);
    expect(res.body.total_esperado).toBe(534);
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
