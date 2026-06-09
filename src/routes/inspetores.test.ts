import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { AdminRecord } from "../auth/types";

// ── Hoisted mock factories ─────────────────────────────────────────────────────
// We rebuild the full Supabase chain on every beforeEach so that
// vi.clearAllMocks() doesn't leave the chain returning undefined.

const { adminFromFn, logChild } = vi.hoisted(() => {
  const logFns  = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logChild = vi.fn().mockReturnValue(logFns);
  const adminFromFn = vi.fn();
  return { adminFromFn, logChild };
});

vi.mock("../db-admin", () => ({
  supabaseAdmin: { from: adminFromFn },
}));
// webhook.ts imports ../db at module load — mock it to prevent the
// "Missing SUPABASE_URL" throw before our test environment is ready.
vi.mock("../db", () => ({
  supabase: { from: vi.fn() },
}));
vi.mock("../logger", () => ({ logger: { child: logChild } }));

// Import after mocks
import inspetoresRouter from "./inspetores";
import { isAuthorized } from "./webhook";

// ── Chain builder ─────────────────────────────────────────────────────────────
// Returns a fresh set of mock functions wired into a fluent Supabase-like chain.
// Call this inside beforeEach after vi.clearAllMocks() to restore defaults.

function buildChain() {
  const maybySingleFn = vi.fn().mockResolvedValue({ data: null,  error: null });
  const singleFn      = vi.fn().mockResolvedValue({ data: null,  error: null });
  const orderFn       = vi.fn().mockResolvedValue({ data: [],    error: null });
  const neqFn         = vi.fn();
  const eqFn          = vi.fn();
  const selectFn      = vi.fn();
  const insertFn      = vi.fn();
  const updateFn      = vi.fn();

  neqFn.mockReturnValue({ eq: eqFn, neq: neqFn, maybeSingle: maybySingleFn });
  eqFn.mockReturnValue({
    eq: eqFn, neq: neqFn, maybeSingle: maybySingleFn, single: singleFn, order: orderFn,
  });
  selectFn.mockReturnValue({ eq: eqFn, order: orderFn });
  insertFn.mockReturnValue({
    select: vi.fn().mockReturnValue({ single: singleFn }),
  });
  updateFn.mockReturnValue({ eq: eqFn });
  adminFromFn.mockReturnValue({ select: selectFn, insert: insertFn, update: updateFn });

  return { maybySingleFn, singleFn, orderFn, eqFn, neqFn, selectFn, insertFn, updateFn };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OWNER: AdminRecord = {
  id: "owner-uid", email: "owner@test.com", nome: "Dono", role: "owner", ativo: true, created_at: "2026-01-01",
};
const MEMBER: AdminRecord = {
  id: "member-uid", email: "member@test.com", nome: "Membro", role: "member", ativo: true, created_at: "2026-01-01",
};

const INSPETOR_ROW = {
  id: "ins-uuid-1",
  nome: "Rodrigo Lima",
  telefone: "(11) 9 1234-5678",
  telefone_normalizado: "11912345678",
  ativo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function makeReq(
  overrides: Partial<Request> & { admin?: AdminRecord } = {}
): Request {
  const { admin, ...rest } = overrides;
  const req = { body: {}, params: {}, query: {}, headers: {}, ...rest } as unknown as Request;
  if (admin) (req as any).admin = admin;
  return req;
}

function makeRes(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json   = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

function getHandler(method: string, routePath: string) {
  const layer = (inspetoresRouter as any).stack.find(
    (l: any) =>
      l.route?.path === routePath &&
      l.route?.methods?.[method.toLowerCase()]
  ) as any;
  if (!layer) throw new Error(`Route ${method} ${routePath} not found`);
  return layer.route.stack[0].handle;
}

// ── Normalization via route behaviour ─────────────────────────────────────────

describe("normalizar (phone normalization)", () => {
  it("strips non-digits and keeps last 11 digits", async () => {
    const { maybySingleFn, singleFn, insertFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });
    singleFn.mockResolvedValueOnce({ data: { ...INSPETOR_ROW }, error: null });

    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "João", telefone: "(11) 9 1234-5678" }, admin: OWNER });
    const { res } = makeRes();
    await handler(req, res);

    expect(insertFn.mock.calls[0][0].telefone_normalizado).toBe("11912345678");
  });

  it("strips country code +55 and keeps DDD+number", async () => {
    const { maybySingleFn, singleFn, insertFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });
    singleFn.mockResolvedValueOnce({ data: { ...INSPETOR_ROW }, error: null });

    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Ana", telefone: "+5511912345678" }, admin: OWNER });
    const { res } = makeRes();
    await handler(req, res);

    expect(insertFn.mock.calls[0][0].telefone_normalizado).toBe("11912345678");
  });
});

// ── GET /inspetores ────────────────────────────────────────────────────────────

describe("GET /inspetores", () => {
  it("owner recebe lista de inspetores", async () => {
    const { orderFn } = buildChain();
    orderFn.mockResolvedValueOnce({ data: [INSPETOR_ROW], error: null });

    const handler = getHandler("get", "/");
    const { res, json } = makeRes();
    await handler(makeReq({ admin: OWNER }), res);

    expect(json).toHaveBeenCalledWith({ inspetores: [INSPETOR_ROW] });
  });

  it("membro também recebe lista (requireAdmin permite owner e member)", async () => {
    const { orderFn } = buildChain();
    orderFn.mockResolvedValueOnce({ data: [INSPETOR_ROW], error: null });

    const handler = getHandler("get", "/");
    const { res, json } = makeRes();
    await handler(makeReq({ admin: MEMBER }), res);

    expect(json).toHaveBeenCalledWith({ inspetores: [INSPETOR_ROW] });
  });

  it("retorna lista vazia quando não há inspetores", async () => {
    const { orderFn } = buildChain();
    orderFn.mockResolvedValueOnce({ data: [], error: null });

    const handler = getHandler("get", "/");
    const { res, json } = makeRes();
    await handler(makeReq({ admin: OWNER }), res);

    expect(json).toHaveBeenCalledWith({ inspetores: [] });
  });
});

// ── POST /inspetores ───────────────────────────────────────────────────────────

describe("POST /inspetores", () => {
  it("cria inspetor com número normalizado", async () => {
    const { maybySingleFn, singleFn, insertFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null }); // sem duplicata
    singleFn.mockResolvedValueOnce({ data: INSPETOR_ROW, error: null });

    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Rodrigo Lima", telefone: "(11) 9 1234-5678" }, admin: OWNER });
    const { res, status, json } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(INSPETOR_ROW);
    expect(insertFn.mock.calls[0][0]).toMatchObject({
      nome: "Rodrigo Lima",
      telefone_normalizado: "11912345678",
      ativo: true,
    });
  });

  it("membro pode criar inspetor (requireAdmin)", async () => {
    const { maybySingleFn, singleFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });
    singleFn.mockResolvedValueOnce({ data: INSPETOR_ROW, error: null });

    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Ana Silva", telefone: "11912345678" }, admin: MEMBER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(201);
  });

  it("rejeita número duplicado ativo com mensagem em pt-BR", async () => {
    const { maybySingleFn, insertFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({
      data: { id: "other-id", nome: "Outro Inspetor" },
      error: null,
    });

    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Novo", telefone: "11912345678" }, admin: OWNER });
    const { res, status, json } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].erro).toMatch(/Outro Inspetor/);
    expect(json.mock.calls[0][0].erro).toMatch(/já existe/i);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("rejeita telefone com menos de 8 dígitos", async () => {
    buildChain();
    const handler = getHandler("post", "/");
    // Nome must pass Zod min(2) so the request reaches normalizar()
    const req = makeReq({ body: { nome: "Xavier", telefone: "123" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(422);
  });

  it("rejeita body sem nome", async () => {
    buildChain();
    const handler = getHandler("post", "/");
    const req = makeReq({ body: { telefone: "11912345678" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
  });
});

// ── PUT /inspetores/:id ────────────────────────────────────────────────────────

describe("PUT /inspetores/:id", () => {
  it("edita o nome do inspetor", async () => {
    const { maybySingleFn, singleFn, updateFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: INSPETOR_ROW, error: null });
    const selectAfterUpdate = vi.fn().mockReturnValue({ single: singleFn });
    updateFn.mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ select: selectAfterUpdate }) });
    singleFn.mockResolvedValueOnce({ data: { ...INSPETOR_ROW, nome: "Rodrigo L. Santos" }, error: null });

    const handler = getHandler("put", "/:id");
    const req = makeReq({ params: { id: "ins-uuid-1" }, body: { nome: "Rodrigo L. Santos" }, admin: OWNER });
    const { res, json } = makeRes();
    await handler(req, res);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ nome: "Rodrigo L. Santos" }));
  });

  it("membro pode editar inspetor", async () => {
    const { maybySingleFn, singleFn, updateFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: INSPETOR_ROW, error: null });
    const selectAfterUpdate = vi.fn().mockReturnValue({ single: singleFn });
    updateFn.mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ select: selectAfterUpdate }) });
    singleFn.mockResolvedValueOnce({ data: { ...INSPETOR_ROW, ativo: false }, error: null });

    const handler = getHandler("put", "/:id");
    const req = makeReq({ params: { id: "ins-uuid-1" }, body: { ativo: false }, admin: MEMBER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).not.toHaveBeenCalledWith(400);
    expect(status).not.toHaveBeenCalledWith(403);
  });

  it("retorna 404 quando inspetor não existe", async () => {
    const { maybySingleFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });

    const handler = getHandler("put", "/:id");
    // Nome must pass Zod min(2) so the request reaches the DB lookup
    const req = makeReq({ params: { id: "no-such-id" }, body: { nome: "Valid Name" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });

  it("rejeita body vazio", async () => {
    buildChain();
    const handler = getHandler("put", "/:id");
    const req = makeReq({ params: { id: "ins-uuid-1" }, body: {}, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
  });
});

// ── DELETE /inspetores/:id (soft-delete) ──────────────────────────────────────

describe("DELETE /inspetores/:id", () => {
  it("desativa inspetor (soft-delete, não remove a linha)", async () => {
    const { maybySingleFn, updateFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: { id: "ins-uuid-1" }, error: null });
    // update() returns a chain whose .eq() resolves to success
    const updateEqFn = vi.fn().mockResolvedValue({ error: null });
    updateFn.mockReturnValueOnce({ eq: updateEqFn });

    const handler = getHandler("delete", "/:id");
    const req = makeReq({ params: { id: "ins-uuid-1" }, admin: OWNER });
    const { res, json } = makeRes();
    await handler(req, res);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ mensagem: expect.stringContaining("desativado") })
    );
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ ativo: false }));
  });

  it("membro pode desativar inspetor", async () => {
    const { maybySingleFn, updateFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: { id: "ins-uuid-1" }, error: null });
    const updateEqFn = vi.fn().mockResolvedValue({ error: null });
    updateFn.mockReturnValueOnce({ eq: updateEqFn });

    const handler = getHandler("delete", "/:id");
    const req = makeReq({ params: { id: "ins-uuid-1" }, admin: MEMBER });
    const { res, status, json } = makeRes();
    await handler(req, res);

    expect(status).not.toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ mensagem: expect.any(String) })
    );
  });

  it("retorna 404 quando inspetor não existe", async () => {
    const { maybySingleFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });

    const handler = getHandler("delete", "/:id");
    const req = makeReq({ params: { id: "no-such-id" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });
});

// ── Webhook authorization ──────────────────────────────────────────────────────
// Tests isAuthorized() exported from webhook.ts.
// Each test builds its own chain so mock state is fully isolated.

describe("isAuthorized (webhook)", () => {
  it("autoriza número que existe e está ativo", async () => {
    const { maybySingleFn, eqFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: { id: "ins-uuid-1" }, error: null });

    const result = await isAuthorized("11912345678");
    expect(result).toBe(true);
    expect(eqFn).toHaveBeenCalledWith("telefone_normalizado", "11912345678");
  });

  it("autoriza número com código de país +55 (normaliza para o mesmo valor)", async () => {
    const { maybySingleFn, eqFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: { id: "ins-uuid-1" }, error: null });

    const result = await isAuthorized("+5511912345678");
    expect(result).toBe(true);
    expect(eqFn).toHaveBeenCalledWith("telefone_normalizado", "11912345678");
  });

  it("autoriza número formatado com parênteses e hífen", async () => {
    const { maybySingleFn, eqFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: { id: "ins-uuid-1" }, error: null });

    const result = await isAuthorized("(11) 9 1234-5678");
    expect(result).toBe(true);
    expect(eqFn).toHaveBeenCalledWith("telefone_normalizado", "11912345678");
  });

  it("rejeita número que não está na tabela (maybySingle retorna null)", async () => {
    const { maybySingleFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });

    const result = await isAuthorized("11999999999");
    expect(result).toBe(false);
  });

  it("rejeita número de inspetor inativo (query filtra ativo=true → retorna null)", async () => {
    const { maybySingleFn, eqFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });

    const result = await isAuthorized("11900000000");
    expect(result).toBe(false);
    expect(eqFn).toHaveBeenCalledWith("ativo", true);
  });

  it("rejeita número com dígitos insuficientes (inválido) sem consultar o banco", async () => {
    const { maybySingleFn } = buildChain();

    const result = await isAuthorized("123");
    expect(result).toBe(false);
    expect(maybySingleFn).not.toHaveBeenCalled();
  });

  it("retorna false quando o banco retorna erro (falha segura)", async () => {
    const { maybySingleFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: { message: "DB timeout" } });

    const result = await isAuthorized("11912345678");
    expect(result).toBe(false);
  });
});
