import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import type { AdminRecord } from "./types";

// ── Hoisted mock state ────────────────────────────────────────────────────────
const {
  getUserFn,
  fromFn,
  selectFn,
  eqFn,
  maybySingleFn,
  createUserFn,
  insertFn,
  logChild,
  // setup-route specific
  setupFromFn,
  setupSelectFn,
  setupEqFn,
  setupMaybySingleFn,
  setupInsertFn,
  setupCreateUserFn,
} = vi.hoisted(() => {
  // ── middleware mock chain: from().select().eq().maybySingle()
  const maybySingleFn  = vi.fn();
  const eqFn           = vi.fn();
  const selectFn       = vi.fn();
  const insertFn       = vi.fn();
  const fromFn         = vi.fn();
  eqFn.mockReturnValue({ eq: eqFn, maybeSingle: maybySingleFn });
  selectFn.mockReturnValue({ eq: eqFn });
  insertFn.mockResolvedValue({ error: null });
  fromFn.mockReturnValue({ select: selectFn, insert: insertFn });

  const getUserFn     = vi.fn();
  const createUserFn  = vi.fn();
  const logFns        = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logChild      = vi.fn().mockReturnValue(logFns);

  // ── setup-route mock chain (separate so each test can rewire independently)
  const setupMaybySingleFn = vi.fn();
  const setupEqFn          = vi.fn();
  const setupSelectFn      = vi.fn();
  const setupInsertFn      = vi.fn();
  const setupFromFn        = vi.fn();
  setupEqFn.mockReturnValue({ eq: setupEqFn, maybeSingle: setupMaybySingleFn });
  setupSelectFn.mockReturnValue({ eq: setupEqFn });
  setupInsertFn.mockResolvedValue({ error: null });
  setupFromFn.mockReturnValue({ select: setupSelectFn, insert: setupInsertFn });

  const setupCreateUserFn = vi.fn();

  return {
    getUserFn, fromFn, selectFn, eqFn, maybySingleFn, createUserFn, insertFn, logChild,
    setupFromFn, setupSelectFn, setupEqFn, setupMaybySingleFn, setupInsertFn, setupCreateUserFn,
  };
});

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("../db-admin", () => ({
  supabaseAdmin: {
    auth: {
      getUser:  getUserFn,
      admin: { createUser: setupCreateUserFn, listUsers: vi.fn() },
    },
    from: fromFn,
  },
}));

vi.mock("../logger", () => ({ logger: { child: logChild } }));

// Separate mock instance for the setup route which imports db-admin too —
// they share the same mock above; we just rewire per-test via setupFromFn/setupCreateUserFn.

import { requireAuth, requireAdmin, requireOwner } from "./middleware";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const OWNER: AdminRecord = {
  id: "uid-owner", email: "owner@test.com", nome: "Dono", role: "owner", ativo: true, created_at: "2026-01-01",
};
const MEMBER: AdminRecord = {
  id: "uid-member", email: "member@test.com", nome: "Membro", role: "member", ativo: true, created_at: "2026-01-01",
};

function mockReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

function mockRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json   = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

function rewireForAdmin(admin: AdminRecord | null, authError: any = null) {
  getUserFn.mockResolvedValue({
    data: { user: admin ? { id: admin.id } : null },
    error: authError,
  });
  maybySingleFn.mockResolvedValue({ data: admin, error: null });
  eqFn.mockReturnValue({ eq: eqFn, maybeSingle: maybySingleFn });
  selectFn.mockReturnValue({ eq: eqFn });
  fromFn.mockReturnValue({ select: selectFn, insert: insertFn });
}

// ── requireAuth ───────────────────────────────────────────────────────────────
describe("requireAuth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 401 quando não há Authorization header", async () => {
    const req  = mockReq();
    const { res, status } = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 401 quando o token JWT é inválido", async () => {
    rewireForAdmin(null, { message: "invalid token" });
    const req  = mockReq({ headers: { authorization: "Bearer bad-token" } });
    const { res, status } = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 401 quando o usuário não tem registro em admins", async () => {
    getUserFn.mockResolvedValue({ data: { user: { id: "uid-unknown" } }, error: null });
    maybySingleFn.mockResolvedValue({ data: null, error: null });
    eqFn.mockReturnValue({ eq: eqFn, maybeSingle: maybySingleFn });
    selectFn.mockReturnValue({ eq: eqFn });
    fromFn.mockReturnValue({ select: selectFn });

    const req  = mockReq({ headers: { authorization: "Bearer valid-but-not-admin" } });
    const { res, status } = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("retorna 403 quando o admin está inativo", async () => {
    const inativo = { ...MEMBER, ativo: false };
    rewireForAdmin(inativo);

    const req  = mockReq({ headers: { authorization: "Bearer token-inativo" } });
    const { res, status } = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("chama next() e anexa req.admin para um admin ativo válido", async () => {
    rewireForAdmin(OWNER);

    const req  = mockReq({ headers: { authorization: "Bearer valid-owner-token" } });
    const { res } = mockRes();
    const next = vi.fn();

    await requireAuth(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect((req as any).admin).toMatchObject({ id: OWNER.id, role: "owner" });
  });
});

// ── requireAdmin ──────────────────────────────────────────────────────────────
describe("requireAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloqueia requisição sem req.admin (401)", async () => {
    const req  = mockReq();
    const { res, status } = mockRes();
    const next = vi.fn();

    await requireAdmin(req, res, next as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("permite owner", async () => {
    const req  = mockReq();
    (req as any).admin = OWNER;
    const { res } = mockRes();
    const next = vi.fn();

    await requireAdmin(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });

  it("permite member", async () => {
    const req  = mockReq();
    (req as any).admin = MEMBER;
    const { res } = mockRes();
    const next = vi.fn();

    await requireAdmin(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });
});

// ── requireOwner ──────────────────────────────────────────────────────────────
describe("requireOwner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloqueia member com 403", async () => {
    const req  = mockReq();
    (req as any).admin = MEMBER;
    const { res, status } = mockRes();
    const next = vi.fn();

    await requireOwner(req, res, next as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("permite owner", async () => {
    const req  = mockReq();
    (req as any).admin = OWNER;
    const { res } = mockRes();
    const next = vi.fn();

    await requireOwner(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
  });

  it("bloqueia requisição sem req.admin (401)", async () => {
    const req  = mockReq();
    const { res, status } = mockRes();
    const next = vi.fn();

    await requireOwner(req, res, next as unknown as NextFunction);

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── setup route ───────────────────────────────────────────────────────────────
// We test the setup route logic by importing it and driving it with mock req/res.
describe("POST /setup — rota de bootstrap do owner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OWNER_EMAIL  = "owner@mansur.com";
    process.env.SETUP_TOKEN  = "supersecret123";

    // Default: no owner exists yet
    setupMaybySingleFn.mockResolvedValue({ data: null, error: null });
    setupEqFn.mockReturnValue({ eq: setupEqFn, maybeSingle: setupMaybySingleFn });
    setupSelectFn.mockReturnValue({ eq: setupEqFn });
    setupInsertFn.mockResolvedValue({ error: null });
    setupFromFn.mockReturnValue({ select: setupSelectFn, insert: setupInsertFn });
    setupCreateUserFn.mockResolvedValue({ data: { user: { id: "new-uid-999" } }, error: null });

    // Point the shared db-admin mock to setup variants for these tests
    fromFn.mockImplementation(setupFromFn);
    createUserFn.mockImplementation(setupCreateUserFn);
  });

  it("cria o owner com sucesso na primeira chamada", async () => {
    // Import setup router handler directly
    const setupMod = await import("../routes/setup");
    // Exercise via supertest-style: build raw req/res
    // We test the module's exported router by calling the handler chain manually.
    // Since the router is an Express Router we drive it with mock req/res/next.
    const req = {
      body: { setup_token: "supersecret123", nome: "Dono Teste", password: "senha12345" },
    } as Request;
    const jsonFn  = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn, json: jsonFn } as unknown as Response;
    const next = vi.fn();

    // Call the router's stack[0].handle directly
    const handler = (setupMod.default.stack[0] as any).route.stack[0].handle;
    await handler(req, res, next);

    expect(setupCreateUserFn).toHaveBeenCalledOnce();
    expect(setupInsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ role: "owner", email: "owner@mansur.com" })
    );
    expect(statusFn).toHaveBeenCalledWith(201);
  });

  it("recusa segunda chamada quando owner já existe (409)", async () => {
    setupMaybySingleFn.mockResolvedValue({ data: { id: "existing-owner" }, error: null });

    const setupMod = await import("../routes/setup");
    const req = {
      body: { setup_token: "supersecret123", nome: "Dono Teste", password: "senha12345" },
    } as Request;
    const jsonFn   = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn, json: jsonFn } as unknown as Response;

    const handler = (setupMod.default.stack[0] as any).route.stack[0].handle;
    await handler(req, res, vi.fn());

    expect(statusFn).toHaveBeenCalledWith(409);
    expect(setupCreateUserFn).not.toHaveBeenCalled();
    expect(setupInsertFn).not.toHaveBeenCalled();
  });

  it("recusa token de setup incorreto (401)", async () => {
    const setupMod = await import("../routes/setup");
    const req = {
      body: { setup_token: "token-errado", nome: "Hacker", password: "senha12345" },
    } as Request;
    const jsonFn   = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn, json: jsonFn } as unknown as Response;

    const handler = (setupMod.default.stack[0] as any).route.stack[0].handle;
    await handler(req, res, vi.fn());

    expect(statusFn).toHaveBeenCalledWith(401);
    expect(setupCreateUserFn).not.toHaveBeenCalled();
  });
});
