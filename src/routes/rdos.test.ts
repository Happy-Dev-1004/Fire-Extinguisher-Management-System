import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

const { adminFromFn } = vi.hoisted(() => ({ adminFromFn: vi.fn() }));
vi.mock("../db-admin", () => ({ supabaseAdmin: { from: adminFromFn } }));
vi.mock("../logger", () => ({ logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
// Stub the heavy collaborators so importing the router stays light.
vi.mock("../rdo/gerarPdf", () => ({ gerarRdoPdf: vi.fn() }));
vi.mock("../rdo/enviarRdo", () => ({ enviarRdo: vi.fn(), UNIDADE_RDO: "RDO" }));
vi.mock("../destinatarios/resolver", () => ({ resolverDestinatarios: vi.fn().mockResolvedValue([]) }));
vi.mock("../alarme/relatorioAlarme", () => ({ rdosParaCsv: vi.fn(), rdosParaPdf: vi.fn(), }));
const { uploadFotoBase64 } = vi.hoisted(() => ({ uploadFotoBase64: vi.fn() }));
vi.mock("../fotos/storage", () => ({ uploadFotoBase64 }));

import rdosRouter from "./rdos";

function findHandler(method: string, path: string) {
  const layer = (rdosRouter as any).stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
  );
  if (!layer) throw new Error(`handler ${method} ${path} não encontrado`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  const res: any = {};
  res.statusCode = 200; res.body = undefined;
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((b: any) => { res.body = b; return res; });
  res.send = vi.fn((b: any) => { res.body = b; return res; });
  res.setHeader = vi.fn();
  return res as Response & { statusCode: number; body: any };
}

beforeEach(() => { adminFromFn.mockReset(); uploadFotoBase64.mockReset(); });

describe("GET /rdos — hides soft-deleted", () => {
  it("excludes status='excluido' when no status filter is given (.neq)", async () => {
    const calls: Record<string, any> = {};
    const chain: any = {
      order: vi.fn(() => chain),
      eq:    vi.fn((k: string, v: any) => { calls[`eq:${k}`] = v; return chain; }),
      neq:   vi.fn((k: string, v: any) => { calls[`neq:${k}`] = v; return chain; }),
      then:  (resolve: any) => resolve({ data: [], error: null }),
    };
    adminFromFn.mockImplementation(() => ({ select: () => chain }));

    const handler = findHandler("get", "/");
    const res = mockRes();
    await handler({ query: {} } as unknown as Request, res);

    expect(res.statusCode).toBe(200);
    expect(calls["neq:status"]).toBe("excluido"); // soft-deleted hidden
  });
});

describe("DELETE /rdos/:id — soft-delete", () => {
  it("sets status='excluido' and returns 204", async () => {
    const updates: Record<string, any> = {};
    adminFromFn.mockImplementation(() => ({
      update: (patch: any) => { Object.assign(updates, patch); return {
        eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "r1" }, error: null }) }) }),
      }; },
    }));

    const handler = findHandler("delete", "/:id");
    const res = mockRes();
    await handler({ params: { id: "r1" }, admin: { email: "o@x.com" } } as unknown as Request, res);

    expect(updates.status).toBe("excluido");
    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when the RDO does not exist", async () => {
    adminFromFn.mockImplementation(() => ({
      update: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
    }));
    const handler = findHandler("delete", "/:id");
    const res = mockRes();
    await handler({ params: { id: "nope" }, admin: {} } as unknown as Request, res);
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /rdos/:id/fotos — add photos to fotos_dia", () => {
  it("uploads + appends the new urls to fotos_dia", async () => {
    uploadFotoBase64.mockResolvedValue("https://s/new.jpg");
    let updated: any = null;
    adminFromFn.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { fotos_dia: ["https://s/old.jpg"] }, error: null }) }) }),
      update: (patch: any) => { updated = patch; return {
        eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "r1", ...patch }, error: null }) }) }),
      }; },
    }));

    const handler = findHandler("post", "/:id/fotos");
    const res = mockRes();
    await handler({ params: { id: "r1" }, body: { fotos: ["data:image/jpeg;base64,AAA"] } } as unknown as Request, res);

    expect(res.statusCode).toBe(200);
    expect(updated.fotos_dia).toEqual(["https://s/old.jpg", "https://s/new.jpg"]);
  });

  it("rejects an empty fotos array (zod 400)", async () => {
    const handler = findHandler("post", "/:id/fotos");
    const res = mockRes();
    await handler({ params: { id: "r1" }, body: { fotos: [] } } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /rdos/:id/pdf?preview=true — light preview", () => {
  it("passes semFotos:true to the generator on preview", async () => {
    const { gerarRdoPdf } = await import("../rdo/gerarPdf");
    (gerarRdoPdf as any).mockResolvedValue({ ok: true, pdfBuffer: Buffer.from("x"), data: "2026-06-18", responsavel: "J" });
    const handler = findHandler("get", "/:id/pdf");
    const res = mockRes();
    await handler({ params: { id: "r1" }, query: { preview: "true" } } as unknown as Request, res);
    expect(gerarRdoPdf).toHaveBeenCalledWith("r1", { semFotos: true });
    expect(res.statusCode).toBe(200);
  });

  it("passes semFotos:false for the full PDF (no preview)", async () => {
    const { gerarRdoPdf } = await import("../rdo/gerarPdf");
    (gerarRdoPdf as any).mockResolvedValue({ ok: true, pdfBuffer: Buffer.from("x"), data: "2026-06-18", responsavel: "J" });
    const handler = findHandler("get", "/:id/pdf");
    const res = mockRes();
    await handler({ params: { id: "r1" }, query: {} } as unknown as Request, res);
    expect(gerarRdoPdf).toHaveBeenCalledWith("r1", { semFotos: false });
  });
});

describe("DELETE /rdos/:id/fotos — remove one photo", () => {
  it("filters the url out of fotos_dia", async () => {
    let updated: any = null;
    adminFromFn.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { fotos_dia: ["a", "b", "c"] }, error: null }) }) }),
      update: (patch: any) => { updated = patch; return {
        eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "r1", ...patch }, error: null }) }) }),
      }; },
    }));

    const handler = findHandler("delete", "/:id/fotos");
    const res = mockRes();
    await handler({ params: { id: "r1" }, body: { url: "b" } } as unknown as Request, res);

    expect(res.statusCode).toBe(200);
    expect(updated.fotos_dia).toEqual(["a", "c"]);
  });
});
