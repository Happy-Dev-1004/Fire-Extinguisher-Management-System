import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import type { AdminRecord } from "../auth/types";

// ── Hoisted mock factories ─────────────────────────────────────────────────────

const { adminFromFn, logChild } = vi.hoisted(() => {
  const logFns  = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logChild = vi.fn().mockReturnValue(logFns);
  const adminFromFn = vi.fn();
  return { adminFromFn, logChild };
});

vi.mock("../db-admin", () => ({
  supabaseAdmin: { from: adminFromFn },
}));
vi.mock("../db", () => ({
  supabase: { from: vi.fn() },
}));
vi.mock("../logger", () => ({ logger: { child: logChild } }));

import destinatariosRouter from "./destinatarios";

// ── Chain builder ──────────────────────────────────────────────────────────────
// Builds a fresh Supabase-like mock chain. Call this inside each test so mocks
// are fully isolated (avoids vi.clearAllMocks() stripping chain implementations).

function buildChain() {
  const maybySingleFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const singleFn      = vi.fn().mockResolvedValue({ data: null, error: null });
  // orderFn returns an object that also has .order (chained calls),
  // and when awaited (or called as a PromiseLike) resolves with data.
  const orderFn2 = vi.fn().mockResolvedValue({ data: [], error: null });
  const orderFn  = vi.fn().mockReturnValue({ order: orderFn2, eq: undefined as any });
  // Allow overriding via mockResolvedValueOnce for GET list tests
  // that await the first order() call directly (single .order chain in inspetores pattern).
  // Here GET uses two .order() calls, so we make orderFn2 the final awaitable.
  const neqFn    = vi.fn();
  const eqFn     = vi.fn();
  const inFn     = vi.fn();
  const selectFn = vi.fn();
  const insertFn = vi.fn();
  const updateFn = vi.fn();

  neqFn.mockReturnValue({ eq: eqFn, neq: neqFn, maybeSingle: maybySingleFn });
  eqFn.mockReturnValue({
    eq: eqFn, neq: neqFn, maybeSingle: maybySingleFn, single: singleFn, order: orderFn, in: inFn,
  });
  inFn.mockReturnValue({ eq: eqFn, order: orderFn });
  selectFn.mockReturnValue({ eq: eqFn, order: orderFn, in: inFn });
  insertFn.mockReturnValue({
    select: vi.fn().mockReturnValue({ single: singleFn }),
  });
  updateFn.mockReturnValue({ eq: eqFn });
  adminFromFn.mockReturnValue({ select: selectFn, insert: insertFn, update: updateFn });

  return { maybySingleFn, singleFn, orderFn, orderFn2, eqFn, neqFn, inFn, selectFn, insertFn, updateFn };
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const OWNER: AdminRecord = {
  id: "owner-uid", email: "owner@test.com", nome: "Dono", role: "owner", ativo: true, created_at: "2026-01-01",
};
const MEMBER: AdminRecord = {
  id: "member-uid", email: "member@test.com", nome: "Membro", role: "member", ativo: true, created_at: "2026-01-01",
};

const DEST_ITABUNA = {
  id: "dest-uuid-1",
  nome: "Carlos Souza",
  telefone: "(73) 9 8888-1111",
  telefone_normalizado: "73988881111",
  unidade: "Itabuna",
  ativo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const DEST_TODAS = {
  id: "dest-uuid-2",
  nome: "Gerente Regional",
  telefone: "(71) 9 7777-2222",
  telefone_normalizado: "71977772222",
  unidade: "*",
  ativo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> & { admin?: AdminRecord } = {}): Request {
  const { admin, ...rest } = overrides;
  const req = { body: {}, params: {}, query: {}, headers: {}, ...rest } as unknown as Request;
  if (admin) (req as any).admin = admin;
  return req;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json   = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  const res    = { status, json } as unknown as Response;
  return { res, status, json };
}

function getHandler(method: string, routePath: string) {
  const layer = (destinatariosRouter as any).stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.[method.toLowerCase()]
  ) as any;
  if (!layer) throw new Error(`Route ${method} ${routePath} not found`);
  return layer.route.stack[0].handle;
}

// ── GET /destinatarios ─────────────────────────────────────────────────────────

describe("GET /destinatarios", () => {
  it("retorna todos os destinatários ordenados", async () => {
    const { orderFn2 } = buildChain();
    orderFn2.mockResolvedValueOnce({ data: [DEST_ITABUNA, DEST_TODAS], error: null });

    const handler = getHandler("get", "/");
    const { res, json } = makeRes();
    await handler(makeReq({ admin: OWNER }), res);

    expect(json).toHaveBeenCalledWith({ destinatarios: [DEST_ITABUNA, DEST_TODAS] });
  });

  it("membro também pode listar destinatários", async () => {
    const { orderFn2 } = buildChain();
    orderFn2.mockResolvedValueOnce({ data: [DEST_ITABUNA], error: null });

    const handler = getHandler("get", "/");
    const { res, json } = makeRes();
    await handler(makeReq({ admin: MEMBER }), res);

    expect(json).toHaveBeenCalledWith({ destinatarios: [DEST_ITABUNA] });
  });

  it("retorna lista vazia quando não há destinatários", async () => {
    const { orderFn2 } = buildChain();
    orderFn2.mockResolvedValueOnce({ data: [], error: null });

    const handler = getHandler("get", "/");
    const { res, json } = makeRes();
    await handler(makeReq({ admin: OWNER }), res);

    expect(json).toHaveBeenCalledWith({ destinatarios: [] });
  });
});

// ── POST /destinatarios ────────────────────────────────────────────────────────

describe("POST /destinatarios", () => {
  it("cria destinatário para unidade específica com telefone normalizado", async () => {
    const { maybySingleFn, singleFn, insertFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null }); // sem duplicata
    singleFn.mockResolvedValueOnce({ data: DEST_ITABUNA, error: null });

    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Carlos Souza", telefone: "(73) 9 8888-1111", unidade: "Itabuna" }, admin: OWNER });
    const { res, status, json } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(DEST_ITABUNA);
    expect(insertFn.mock.calls[0][0]).toMatchObject({
      nome:                 "Carlos Souza",
      unidade:              "Itabuna",
      telefone_normalizado: "73988881111",
      ativo:                true,
    });
  });

  it("cria destinatário só com e-mail (sem telefone)", async () => {
    const { singleFn, insertFn } = buildChain();
    singleFn.mockResolvedValueOnce({ data: DEST_ITABUNA, error: null });

    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Gestora Email", email: "gestora@empresa.com", unidade: "Itabuna" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(201);
    expect(insertFn.mock.calls[0][0]).toMatchObject({
      nome:                 "Gestora Email",
      email:                "gestora@empresa.com",
      telefone_normalizado: "",
    });
  });

  it("rejeita destinatário sem nenhum canal (sem telefone e sem e-mail)", async () => {
    buildChain();
    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Sem Canal", unidade: "Itabuna" }, admin: OWNER });
    const { res, status, json } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(422);
    expect(json.mock.calls[0][0].erro).toMatch(/canal/i);
  });

  it("rejeita e-mail com formato inválido", async () => {
    buildChain();
    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Email Ruim", email: "isso-nao-e-email", unidade: "Itabuna" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("cria destinatário 'todas as unidades' com sentinel '*'", async () => {
    const { maybySingleFn, singleFn, insertFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });
    singleFn.mockResolvedValueOnce({ data: DEST_TODAS, error: null });

    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Gerente Regional", telefone: "(71) 9 7777-2222", unidade: "*" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(201);
    expect(insertFn.mock.calls[0][0]).toMatchObject({ unidade: "*" });
  });

  it("membro pode criar destinatário", async () => {
    const { maybySingleFn, singleFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });
    singleFn.mockResolvedValueOnce({ data: DEST_ITABUNA, error: null });

    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Carlos Souza", telefone: "73988881111", unidade: "Itabuna" }, admin: MEMBER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(201);
  });

  it("rejeita número duplicado no mesmo escopo com mensagem em pt-BR", async () => {
    const { maybySingleFn, insertFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({
      data: { id: "other-id", nome: "Carlos Souza" },
      error: null,
    });

    const handler = getHandler("post", "/");
    const req = makeReq({
      body: { nome: "Outro Carlos", telefone: "73988881111", unidade: "Itabuna" },
      admin: OWNER,
    });
    const { res, status, json } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].erro).toMatch(/Carlos Souza/);
    expect(json.mock.calls[0][0].erro).toMatch(/Itabuna/);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("o mesmo telefone pode existir em escopos diferentes (unidade X e *)", async () => {
    // Scope-specific check returns null → no conflict within the target scope.
    const { maybySingleFn, singleFn, insertFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null }); // no dup in '*' scope
    singleFn.mockResolvedValueOnce({ data: DEST_TODAS, error: null });

    const handler = getHandler("post", "/");
    // Phone 73988881111 already exists for unidade "Itabuna"; creating same phone for "*" must succeed.
    const req = makeReq({
      body: { nome: "Gerente Regional", telefone: "73988881111", unidade: "*" },
      admin: OWNER,
    });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(201);
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ unidade: "*" }));
  });

  it("rejeita telefone inválido com menos de 8 dígitos", async () => {
    buildChain();
    const handler = getHandler("post", "/");
    const req = makeReq({ body: { nome: "Xavier Alves", telefone: "123", unidade: "Itabuna" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(422);
  });

  it("rejeita body sem nome", async () => {
    buildChain();
    const handler = getHandler("post", "/");
    const req = makeReq({ body: { telefone: "73988881111", unidade: "Itabuna" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
  });
});

// ── PUT /destinatarios/:id ─────────────────────────────────────────────────────

describe("PUT /destinatarios/:id", () => {
  it("edita o nome do destinatário", async () => {
    const { maybySingleFn, singleFn, updateFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: DEST_ITABUNA, error: null });
    const selectAfterUpdate = vi.fn().mockReturnValue({ single: singleFn });
    updateFn.mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ select: selectAfterUpdate }) });
    singleFn.mockResolvedValueOnce({ data: { ...DEST_ITABUNA, nome: "Carlos A. Souza" }, error: null });

    const handler = getHandler("put", "/:id");
    const req = makeReq({ params: { id: "dest-uuid-1" }, body: { nome: "Carlos A. Souza" }, admin: OWNER });
    const { res, json } = makeRes();
    await handler(req, res);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ nome: "Carlos A. Souza" }));
  });

  it("membro pode editar destinatário", async () => {
    const { maybySingleFn, singleFn, updateFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: DEST_ITABUNA, error: null });
    const selectAfterUpdate = vi.fn().mockReturnValue({ single: singleFn });
    updateFn.mockReturnValueOnce({ eq: vi.fn().mockReturnValue({ select: selectAfterUpdate }) });
    singleFn.mockResolvedValueOnce({ data: { ...DEST_ITABUNA, ativo: false }, error: null });

    const handler = getHandler("put", "/:id");
    const req = makeReq({ params: { id: "dest-uuid-1" }, body: { ativo: false }, admin: MEMBER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).not.toHaveBeenCalledWith(403);
    expect(status).not.toHaveBeenCalledWith(400);
  });

  it("retorna 404 quando destinatário não existe", async () => {
    const { maybySingleFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });

    const handler = getHandler("put", "/:id");
    const req = makeReq({ params: { id: "no-such-id" }, body: { nome: "Valid Name" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });

  it("rejeita body vazio", async () => {
    buildChain();
    const handler = getHandler("put", "/:id");
    const req = makeReq({ params: { id: "dest-uuid-1" }, body: {}, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(400);
  });
});

// ── DELETE /destinatarios/:id (soft-delete) ────────────────────────────────────

describe("DELETE /destinatarios/:id", () => {
  it("desativa destinatário (soft-delete, preserva histórico)", async () => {
    const { maybySingleFn, updateFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: { id: "dest-uuid-1" }, error: null });
    const updateEqFn = vi.fn().mockResolvedValue({ error: null });
    updateFn.mockReturnValueOnce({ eq: updateEqFn });

    const handler = getHandler("delete", "/:id");
    const req = makeReq({ params: { id: "dest-uuid-1" }, admin: OWNER });
    const { res, json } = makeRes();
    await handler(req, res);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ mensagem: expect.stringContaining("desativado") })
    );
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ ativo: false }));
  });

  it("membro pode desativar destinatário", async () => {
    const { maybySingleFn, updateFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: { id: "dest-uuid-1" }, error: null });
    const updateEqFn = vi.fn().mockResolvedValue({ error: null });
    updateFn.mockReturnValueOnce({ eq: updateEqFn });

    const handler = getHandler("delete", "/:id");
    const req = makeReq({ params: { id: "dest-uuid-1" }, admin: MEMBER });
    const { res, status, json } = makeRes();
    await handler(req, res);

    expect(status).not.toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ mensagem: expect.any(String) }));
  });

  it("retorna 404 quando destinatário não existe", async () => {
    const { maybySingleFn } = buildChain();
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });

    const handler = getHandler("delete", "/:id");
    const req = makeReq({ params: { id: "no-such-id" }, admin: OWNER });
    const { res, status } = makeRes();
    await handler(req, res);

    expect(status).toHaveBeenCalledWith(404);
  });
});

// ── Resolver: todas as unidades appears in every site's list ──────────────────
// Tests the resolverDestinatarios module directly (no HTTP layer needed).

import { resolverDestinatarios } from "../destinatarios/resolver";

describe("resolverDestinatarios", () => {
  it("inclui destinatário '*' na resolução de qualquer unidade", async () => {
    const { orderFn2 } = buildChain();
    orderFn2.mockResolvedValueOnce({ data: [DEST_TODAS, DEST_ITABUNA], error: null });

    const resultado = await resolverDestinatarios("Itabuna");

    const nomes = resultado.map((d) => d.nome);
    expect(nomes).toContain("Gerente Regional");
    expect(nomes).toContain("Carlos Souza");
  });

  it("de-duplica: pessoa em escopo '*' e específico recebe apenas uma entrada", async () => {
    // Same phone in both scopes — site-specific row should win.
    const destEspecifico = { ...DEST_TODAS, id: "dest-uuid-3", unidade: "Itabuna" };
    const { orderFn2 } = buildChain();
    // '*' row comes first (ASC order), site-specific overwrites it in the Map
    orderFn2.mockResolvedValueOnce({
      data: [DEST_TODAS, destEspecifico],
      error: null,
    });

    const resultado = await resolverDestinatarios("Itabuna");

    const matches = resultado.filter((d) => d.telefone_normalizado === DEST_TODAS.telefone_normalizado);
    expect(matches).toHaveLength(1);
    expect(matches[0].unidade).toBe("Itabuna");
  });

  it("retorna lista vazia quando não há destinatários ativos", async () => {
    const { orderFn2 } = buildChain();
    orderFn2.mockResolvedValueOnce({ data: [], error: null });

    const resultado = await resolverDestinatarios("Unidade Inexistente");
    expect(resultado).toHaveLength(0);
  });

  it("retorna lista vazia em caso de erro de banco (não lança exceção)", async () => {
    const { orderFn2 } = buildChain();
    orderFn2.mockResolvedValueOnce({ data: null, error: { message: "DB offline" } });

    const resultado = await resolverDestinatarios("Itabuna");
    expect(resultado).toHaveLength(0);
  });
});
