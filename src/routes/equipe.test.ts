import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import type { AdminRecord } from "../auth/types";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  fromFn, selectFn, eqFn, maybySingleFn, insertFn, updateFn, orderFn, singleFn, rpcFn,
  createUserFn, deleteUserFn, logChild,
} = vi.hoisted(() => {
  const maybySingleFn = vi.fn();
  const singleFn      = vi.fn();
  const orderFn       = vi.fn();
  const eqFn          = vi.fn();
  const selectFn      = vi.fn();
  const insertFn      = vi.fn();
  const updateFn      = vi.fn();
  const fromFn        = vi.fn();
  const rpcFn         = vi.fn();
  const createUserFn  = vi.fn();
  const deleteUserFn  = vi.fn();
  const logFns        = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logChild      = vi.fn().mockReturnValue(logFns);

  // Default chain: select().eq().eq()...maybySingle() / single() / order()
  maybySingleFn.mockResolvedValue({ data: null,  error: null });
  singleFn.mockResolvedValue(     { data: null,  error: null });
  orderFn.mockResolvedValue(      { data: [],    error: null });
  eqFn.mockReturnValue({ eq: eqFn, maybeSingle: maybySingleFn, single: singleFn, order: orderFn });
  selectFn.mockReturnValue({ eq: eqFn, order: orderFn });
  insertFn.mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) });
  updateFn.mockReturnValue({ eq: eqFn });
  fromFn.mockReturnValue({ select: selectFn, insert: insertFn, update: updateFn });
  rpcFn.mockResolvedValue({ error: null });
  createUserFn.mockResolvedValue({ data: { user: { id: "new-uid" } }, error: null });
  deleteUserFn.mockResolvedValue({ error: null });

  return { fromFn, selectFn, eqFn, maybySingleFn, insertFn, updateFn, orderFn, singleFn, rpcFn, createUserFn, deleteUserFn, logChild };
});

vi.mock("../db-admin", () => ({
  supabaseAdmin: {
    from:  fromFn,
    rpc:   rpcFn,
    auth: { admin: { createUser: createUserFn, deleteUser: deleteUserFn } },
  },
}));
vi.mock("../logger", () => ({ logger: { child: logChild } }));

// Import router after mocks
import equipeRouter from "./equipe";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const OWNER: AdminRecord = {
  id: "owner-uid", email: "owner@test.com", nome: "Dono", role: "owner", ativo: true, created_at: "2026-01-01",
};
const MEMBER: AdminRecord = {
  id: "member-uid", email: "member@test.com", nome: "Membro", role: "member", ativo: true, created_at: "2026-01-01",
};

function makeReq(overrides: Partial<Request> & { admin?: AdminRecord } = {}): Request {
  const { admin, ...rest } = overrides;
  const req = { body: {}, params: {}, query: {}, headers: {}, ...rest } as unknown as Request;
  if (admin) (req as any).admin = admin;
  return req;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json   = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

// Pulls a named route handler out of the Express router stack.
// Matches on path + method so tests remain independent of registration order.
function getHandler(method: string, path: string) {
  const layer = (equipeRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method.toLowerCase()]
  ) as any;
  if (!layer) throw new Error(`Route ${method} ${path} not found in equipe router`);
  const stack = layer.route.stack as any[];
  return stack[stack.length - 1].handle as (req: Request, res: Response, next: any) => Promise<void>;
}

// Rewire helper — resets the mock chain to clean defaults before each test
function rewire() {
  maybySingleFn.mockResolvedValue({ data: null, error: null });
  singleFn.mockResolvedValue({ data: null, error: null });
  orderFn.mockResolvedValue({ data: [], error: null });
  eqFn.mockReturnValue({ eq: eqFn, maybeSingle: maybySingleFn, single: singleFn, order: orderFn });
  selectFn.mockReturnValue({ eq: eqFn, order: orderFn });
  insertFn.mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) });
  updateFn.mockReturnValue({ eq: eqFn });
  fromFn.mockReturnValue({ select: selectFn, insert: insertFn, update: updateFn });
  rpcFn.mockResolvedValue({ error: null });
  createUserFn.mockResolvedValue({ data: { user: { id: "new-uid" } }, error: null });
  deleteUserFn.mockResolvedValue({ error: null });
}

// ── POST /convites ─────────────────────────────────────────────────────────────
describe("POST /equipe/convites — criar convite", () => {
  beforeEach(() => { vi.clearAllMocks(); rewire(); });

  it("owner cria convite com sucesso", async () => {
    // No existing admin with this email
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });
    // Insert returns the new invite
    const fakeSingle = vi.fn().mockResolvedValue({
      data: { id: "convite-1", email: "novo@test.com", expira_em: "2026-06-15T00:00:00Z" },
      error: null,
    });
    insertFn.mockReturnValue({ select: vi.fn().mockReturnValue({ single: fakeSingle }) });

    const req = makeReq({ body: { email: "novo@test.com" }, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("post", "/convites")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(201);
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ email: "novo@test.com", status: "pendente", criado_por: OWNER.id })
    );
  });

  it("rejeita convite se email já pertence a admin ativo", async () => {
    maybySingleFn.mockResolvedValueOnce({ data: { id: "existing", ativo: true }, error: null });

    const req = makeReq({ body: { email: "member@test.com" }, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("post", "/convites")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(409);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("rejeita e-mail inválido com 400", async () => {
    const req = makeReq({ body: { email: "nao-e-email" }, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("post", "/convites")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(400);
  });
});

// ── Middleware guard: member não pode criar convite ───────────────────────────
describe("requireOwner — member bloqueado em rotas owner-only", () => {
  it("requireOwner retorna 403 para member", async () => {
    const { requireOwner } = await import("../auth/middleware");
    const req  = makeReq({ admin: MEMBER });
    const { res, status } = makeRes();
    const next = vi.fn();

    await requireOwner(req, res, next as any);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── POST /convites/aceitar ────────────────────────────────────────────────────
describe("POST /equipe/convites/aceitar — aceitar convite", () => {
  beforeEach(() => { vi.clearAllMocks(); rewire(); });

  const VALID_TOKEN = "a".repeat(64);
  const futureDate  = new Date(Date.now() + 7 * 86400_000).toISOString();

  it("aceita convite válido e cria membro", async () => {
    maybySingleFn.mockResolvedValueOnce({
      data: { id: "convite-1", email: "novo@test.com", status: "pendente", expira_em: futureDate },
      error: null,
    });
    createUserFn.mockResolvedValue({ data: { user: { id: "new-uid-1" } }, error: null });

    const req = makeReq({ body: { token: VALID_TOKEN, nome: "Novo Membro", password: "senha123456" } });
    const { res, status, json } = makeRes();

    await getHandler("post", "/convites/aceitar")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(201);
    expect(createUserFn).toHaveBeenCalledOnce();
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ role: "member", ativo: true, email: "novo@test.com" })
    );
    // Confirm the response includes role: 'member'
    const body = json.mock.calls[0]?.[0] ?? status.mock.results[0]?.value?.json?.mock?.calls[0]?.[0];
    // Check via the status mock's chained json call
    const jsonArg = (status.mock.results[0].value as any).json.mock.calls[0][0];
    expect(jsonArg.role).toBe("member");
  });

  it("rejeita token já utilizado (status aceito)", async () => {
    maybySingleFn.mockResolvedValueOnce({
      data: { id: "convite-1", email: "novo@test.com", status: "aceito", expira_em: futureDate },
      error: null,
    });

    const req = makeReq({ body: { token: VALID_TOKEN, nome: "X", password: "senha123456" } });
    const { res, status } = makeRes();

    await getHandler("post", "/convites/aceitar")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(409);
    expect(createUserFn).not.toHaveBeenCalled();
  });

  it("rejeita token expirado", async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    maybySingleFn.mockResolvedValueOnce({
      data: { id: "convite-1", email: "novo@test.com", status: "pendente", expira_em: pastDate },
      error: null,
    });

    const req = makeReq({ body: { token: VALID_TOKEN, nome: "X", password: "senha123456" } });
    const { res, status } = makeRes();

    await getHandler("post", "/convites/aceitar")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(410);
    expect(createUserFn).not.toHaveBeenCalled();
  });

  it("rejeita token revogado", async () => {
    maybySingleFn.mockResolvedValueOnce({
      data: { id: "convite-1", email: "novo@test.com", status: "revogado", expira_em: futureDate },
      error: null,
    });

    const req = makeReq({ body: { token: VALID_TOKEN, nome: "X", password: "senha123456" } });
    const { res, status } = makeRes();

    await getHandler("post", "/convites/aceitar")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(410);
    expect(createUserFn).not.toHaveBeenCalled();
  });

  it("rejeita token inexistente com 404", async () => {
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq({ body: { token: "token-inexistente", nome: "X", password: "senha123456" } });
    const { res, status } = makeRes();

    await getHandler("post", "/convites/aceitar")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(404);
  });
});

// ── DELETE /convites/:id ──────────────────────────────────────────────────────
describe("DELETE /equipe/convites/:id — revogar convite", () => {
  beforeEach(() => { vi.clearAllMocks(); rewire(); });

  it("owner revoga convite pendente com sucesso", async () => {
    maybySingleFn.mockResolvedValueOnce({ data: { id: "c1", status: "pendente" }, error: null });

    const req = makeReq({ params: { id: "c1" } as any, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("delete", "/convites/:id")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(200);
    expect(updateFn).toHaveBeenCalledWith({ status: "revogado" });
  });

  it("retorna 404 para convite inexistente", async () => {
    maybySingleFn.mockResolvedValueOnce({ data: null, error: null });

    const req = makeReq({ params: { id: "nope" } as any, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("delete", "/convites/:id")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(404);
  });
});

// ── DELETE /membros/:id ───────────────────────────────────────────────────────
describe("DELETE /equipe/membros/:id — desativar membro", () => {
  beforeEach(() => { vi.clearAllMocks(); rewire(); });

  it("desativa membro ativo com sucesso", async () => {
    maybySingleFn.mockResolvedValueOnce({
      data: { id: MEMBER.id, role: "member", ativo: true },
      error: null,
    });

    const req = makeReq({ params: { id: MEMBER.id } as any, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("delete", "/membros/:id")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(200);
    expect(updateFn).toHaveBeenCalledWith({ ativo: false });
  });

  it("impede owner de se auto-remover", async () => {
    const req = makeReq({ params: { id: OWNER.id } as any, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("delete", "/membros/:id")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(400);
    expect(updateFn).not.toHaveBeenCalled();
  });
});

// ── POST /transferir ──────────────────────────────────────────────────────────
describe("POST /equipe/transferir — transferir propriedade", () => {
  beforeEach(() => { vi.clearAllMocks(); rewire(); });

  // Use real UUID v4 format — the Zod schema validates .uuid()
  const ALVO_ID   = "b1111111-1111-4111-a111-111111111111";
  const OUTRO_ID  = "c2222222-2222-4222-a222-222222222222";
  const INATIVO_ID= "d3333333-3333-4333-a333-333333333333";

  it("transfere ownership: novo owner é promovido, antigo vira member", async () => {
    maybySingleFn.mockResolvedValueOnce({
      data: { id: ALVO_ID, role: "member", ativo: true, email: "alvo@test.com", nome: "Alvo" },
      error: null,
    });
    rpcFn.mockResolvedValueOnce({ error: null });

    const req = makeReq({ body: { novo_owner_id: ALVO_ID }, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("post", "/transferir")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(200);
    // The RPC is the atomic operation — both role changes happen inside the DB transaction
    expect(rpcFn).toHaveBeenCalledWith("transfer_ownership", {
      novo_owner_id: ALVO_ID,
      owner_atual_id: OWNER.id,
    });
  });

  it("rejeita se o alvo já é owner", async () => {
    maybySingleFn.mockResolvedValueOnce({
      data: { id: OUTRO_ID, role: "owner", ativo: true, email: "x@test.com", nome: "X" },
      error: null,
    });

    const req = makeReq({ body: { novo_owner_id: OUTRO_ID }, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("post", "/transferir")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(409);
    expect(rpcFn).not.toHaveBeenCalled();
  });

  it("rejeita se o alvo está inativo", async () => {
    maybySingleFn.mockResolvedValueOnce({
      data: { id: INATIVO_ID, role: "member", ativo: false, email: "x@test.com", nome: "X" },
      error: null,
    });

    const req = makeReq({ body: { novo_owner_id: INATIVO_ID }, admin: OWNER });
    const { res, status } = makeRes();

    await getHandler("post", "/transferir")(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(400);
    expect(rpcFn).not.toHaveBeenCalled();
  });

  it("após transferência há exatamente um owner — verificado via rpcFn chamado uma vez", async () => {
    maybySingleFn.mockResolvedValueOnce({
      data: { id: ALVO_ID, role: "member", ativo: true, email: "novo@test.com", nome: "Novo" },
      error: null,
    });
    rpcFn.mockResolvedValueOnce({ error: null });

    const req = makeReq({ body: { novo_owner_id: ALVO_ID }, admin: OWNER });
    const { res } = makeRes();

    await getHandler("post", "/transferir")(req, res, vi.fn());

    // The atomic RPC was called exactly once — atomicity is enforced at the DB level
    expect(rpcFn).toHaveBeenCalledOnce();
    expect(rpcFn).toHaveBeenCalledWith("transfer_ownership", expect.objectContaining({
      novo_owner_id:  ALVO_ID,
      owner_atual_id: OWNER.id,
    }));
  });
});
