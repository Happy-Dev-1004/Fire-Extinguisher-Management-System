import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RespostaIA } from "../analise/schema";

// ── Shared mock state (hoisted so vi.mock factories can reference them) ────────
const {
  fetchMock,
  maybySingleFn,
  updateFn,
  eqFn,
  fromFn,
  logChild,
} = vi.hoisted(() => {
  const maybySingleFn = vi.fn();
  const eqFn          = vi.fn();
  const updateFn      = vi.fn();
  const fromFn        = vi.fn();
  const fetchMock     = vi.fn();
  const logFns        = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logChild      = vi.fn().mockReturnValue(logFns);

  eqFn.mockReturnValue({ eq: eqFn, maybeSingle: maybySingleFn });
  maybySingleFn.mockResolvedValue({ data: { notificado: false }, error: null });
  updateFn.mockReturnValue({ eq: eqFn });
  fromFn.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: eqFn }), update: updateFn });

  return { fetchMock, maybySingleFn, updateFn, eqFn, fromFn, logChild };
});

vi.mock("../db",     () => ({ supabase: { from: fromFn } }));
vi.mock("../logger", () => ({ logger: { child: logChild } }));
vi.mock("../segredos/getSecret", () => ({
  getSecret: vi.fn(async (nome: string) => {
    const map: Record<string, string> = {
      ZAPI_INSTANCE_ID:  "inst-fake",
      ZAPI_TOKEN:        "tok-fake",
      ZAPI_CLIENT_TOKEN: "client-fake",
    };
    if (map[nome]) return map[nome];
    throw new Error(`getSecret: '${nome}' não configurado no mock`);
  }),
}));

// Stub global fetch so no real HTTP calls are made
vi.stubGlobal("fetch", fetchMock);

// Import after mocks are in place
import { montarMensagemConfirmacao } from "./mensagem";
import { notificarInspetorPorLote }  from "./notificar";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const RESULTADO_OK: RespostaIA = {
  numero_extintor: "03",
  unidade: "Itabuna",
  setor: "Almoxarifado",
  tipo_carga: "ABC 06 KG",
  capacidade: "6 KG",
  vencimento_carga: "nov/26",
  vencimento_teste: "mar/28",
  inspetor: "Carlos",
  lacre:                  "OK",
  vencimento_carga_status:"OK",
  vencimento_teste_status:"OK",
  manometro:              "OK",
  sinalizacao_parede:     "OK",
  sinalizacao_piso:       "N.A",
  suporte:                "OK",
  mangueira:              "OK",
  quadro_instrucao:       "OK",
  status_geral:   "Aprovado",
  observacoes:    "Tudo em ordem",
  confianca:      0.95,
};

const RESULTADO_COM_REPROVADOS: RespostaIA = {
  ...RESULTADO_OK,
  lacre:    "Reprovado",
  mangueira:"Reprovado",
  status_geral: "Reprovado",
};

const ENTRADA_BASE = {
  loteId:    "lote-xyz-999",
  phone:     "5573999990000",
  resultado: RESULTADO_OK,
  unidade:   "Itabuna",
};

function rewire(notificado = false) {
  const logFns = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  logChild.mockReturnValue(logFns);

  maybySingleFn.mockResolvedValue({ data: { notificado }, error: null });
  eqFn.mockReturnValue({ eq: eqFn, maybeSingle: maybySingleFn });
  updateFn.mockReturnValue({ eq: eqFn });
  fromFn.mockReturnValue({
    select: vi.fn().mockReturnValue({ eq: eqFn }),
    update: updateFn,
  });
}

// ── mensagem.ts unit tests ────────────────────────────────────────────────────
describe("montarMensagemConfirmacao", () => {
  it("inspeção conforme: inclui número, unidade e vencimento da carga", () => {
    const texto = montarMensagemConfirmacao(RESULTADO_OK, "Itabuna");

    expect(texto).toContain("03");
    expect(texto).toContain("Itabuna");
    expect(texto).toContain("nov/26");
    expect(texto).toContain("✅");
    expect(texto).not.toContain("⚠️");
    // No markdown asterisks
    expect(texto).not.toMatch(/\*[^*]+\*/);
  });

  it("inspeção com dois reprovados: mensagem de alerta com os dois itens nomeados", () => {
    const texto = montarMensagemConfirmacao(RESULTADO_COM_REPROVADOS, "Itabuna");

    expect(texto).toContain("⚠️");
    expect(texto).toContain("Lacre");
    expect(texto).toContain("Mangueira");
    expect(texto).not.toContain("✅");
    // No markdown asterisks
    expect(texto).not.toMatch(/\*[^*]+\*/);
  });
});

// ── notificar.ts integration tests ───────────────────────────────────────────
describe("notificarInspetorPorLote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewire();
    // Default: Z-API returns 200 OK
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
  });

  it("inspeção conforme: envia mensagem com ✅ contendo número e unidade corretos", async () => {
    await notificarInspetorPorLote(ENTRADA_BASE);

    expect(fetchMock).toHaveBeenCalledOnce();
    const bodyStr = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(bodyStr.message).toContain("✅");
    expect(bodyStr.message).toContain("03");
    expect(bodyStr.message).toContain("Itabuna");
    expect(bodyStr.phone).toBe("5573999990000");
  });

  it("inspeção com dois Reprovado: mensagem ⚠️ nomeia exatamente os dois itens", async () => {
    await notificarInspetorPorLote({ ...ENTRADA_BASE, resultado: RESULTADO_COM_REPROVADOS });

    expect(fetchMock).toHaveBeenCalledOnce();
    const bodyStr = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(bodyStr.message).toContain("⚠️");
    expect(bodyStr.message).toContain("Lacre");
    expect(bodyStr.message).toContain("Mangueira");
    // Should NOT mention items that are OK
    expect(bodyStr.message).not.toContain("Manômetro");
    expect(bodyStr.message).not.toContain("Suporte");
  });

  it("falha Z-API transitória: retenta e loga sem lançar exceção", async () => {
    // First two calls fail with 503, third succeeds
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "Service Unavailable" })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "Service Unavailable" })
      .mockResolvedValueOnce({ ok: true,  status: 200 });

    // Should not throw
    await expect(notificarInspetorPorLote(ENTRADA_BASE)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falha Z-API permanente: loga erro e retorna sem lançar exceção", async () => {
    // All retries fail
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => "" });

    await expect(notificarInspetorPorLote(ENTRADA_BASE)).resolves.toBeUndefined();

    // fetch called MAX_TENTATIVAS (3) times
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Flag must NOT be set to true after a failed send
    const updateCalls = updateFn.mock.calls;
    const notificadoUpdate = updateCalls.find(
      (args: any[]) => args[0]?.notificado === true
    );
    expect(notificadoUpdate).toBeUndefined();
  });

  it("lote já notificado: não envia segunda mensagem", async () => {
    rewire(true); // notificado = true

    await notificarInspetorPorLote(ENTRADA_BASE);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
