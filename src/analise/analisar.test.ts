import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs before vi.mock factories — required for shared mock state
const { mockCreate, fromFn, updateFn, eqOuter, eqInner } = vi.hoisted(() => {
  const eqInner  = vi.fn().mockResolvedValue({ error: null });
  const eqOuter  = vi.fn().mockReturnValue({ eq: eqInner });
  const updateFn = vi.fn().mockReturnValue({ eq: eqOuter });
  const fromFn   = vi.fn().mockReturnValue({ update: updateFn });
  const mockCreate = vi.fn();
  return { mockCreate, fromFn, updateFn, eqOuter, eqInner };
});

vi.mock("../db", () => ({
  supabase: { from: fromFn },
}));

// db-admin throws at import without SUPABASE env vars; mock it. The inspector
// unit lookup (getUnidadeInspetor) chains .select().in().eq().limit().
vi.mock("../db-admin", () => {
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const eq = vi.fn().mockReturnValue({ limit, eq: vi.fn().mockReturnValue({ limit }) });
  const inFn = vi.fn().mockReturnValue({ eq, limit });
  const select = vi.fn().mockReturnValue({ in: inFn, eq });
  return { supabaseAdmin: { from: vi.fn().mockReturnValue({ select }) } };
});

// Must use `function` keyword — vi.fn() arrow mocks don't work as constructors
vi.mock("openai", () => {
  const FakeOpenAI = function(this: any) {
    this.chat = { completions: { create: mockCreate } };
  };
  return { default: FakeOpenAI };
});

vi.mock("../logger", () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Stub out the notificacao module so analisar tests never make real HTTP calls
vi.mock("../notificacao/notificar", () => ({
  notificarInspetorPorLote: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../segredos/getSecret", () => ({
  getSecret: vi.fn().mockResolvedValue("sk-test-fake-key"),
}));

import { analisarLote, extrairNumeroTag, type LoteFotos } from "./analisar";

// ── Helpers ──────────────────────────────────────────────────────────────────
function mockOpenAIResponse(content: string) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content } }],
  });
}

function rewireSupabaseMock() {
  eqInner.mockResolvedValue({ error: null });
  eqOuter.mockReturnValue({ eq: eqInner });
  updateFn.mockReturnValue({ eq: eqOuter });
  fromFn.mockReturnValue({ update: updateFn });
}

const LOTE_VALIDO: LoteFotos = {
  id: "test-id-123",
  phone: "5573999990000",
  legenda: "01",
  fotos: ["https://example.com/foto1.jpg", "https://example.com/foto2.jpg"],
  status: "pronto",
};

const RESPOSTA_VALIDA = JSON.stringify({
  numero_extintor: "01",
  unidade: "Itabuna",
  setor: "Recepção",
  tipo_carga: "ABC 06 KG",
  capacidade: "6 KG",
  vencimento_carga: "nov/26",
  vencimento_teste: "mar/28",
  inspetor: "Carlos",
  lacre: "OK",
  vencimento_carga_status: "OK",
  vencimento_teste_status: "OK",
  manometro: "OK",
  sinalizacao_parede: "OK",
  sinalizacao_piso: "N.A",
  suporte: "OK",
  mangueira: "OK",
  quadro_instrucao: "OK",
  status_geral: "Aprovado",
  observacoes: "Tudo em ordem",
  confianca: 0.95,
});

const RESPOSTA_CO2 = JSON.stringify({
  numero_extintor: "07",
  unidade: "Itabuna",
  setor: "Servidor",
  tipo_carga: "CO2 06 KG",
  capacidade: "6 KG",
  vencimento_carga: "jan/27",
  vencimento_teste: "jun/28",
  inspetor: null,
  lacre: "OK",
  vencimento_carga_status: "OK",
  vencimento_teste_status: "OK",
  manometro: "OK", // model wrongly says OK — domain rule must override to N.A
  sinalizacao_parede: "OK",
  sinalizacao_piso: "OK",
  suporte: "OK",
  mangueira: "N.A",
  quadro_instrucao: "OK",
  status_geral: "Aprovado",
  observacoes: "Extintor CO2",
  confianca: 0.9,
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe("analisarLote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewireSupabaseMock();
  });

  it("parseia e valida uma resposta JSON válida", async () => {
    mockOpenAIResponse(RESPOSTA_VALIDA);
    const resultado = await analisarLote(LOTE_VALIDO);

    expect(resultado).not.toBeNull();
    expect(resultado?.numero_extintor).toBe("01");
    expect(resultado?.unidade).toBe("Itabuna");
    expect(resultado?.lacre).toBe("OK");
    expect(resultado?.confianca).toBe(0.95);
  });

  it("remove fences ```json e parseia corretamente", async () => {
    mockOpenAIResponse("```json\n" + RESPOSTA_VALIDA + "\n```");
    const resultado = await analisarLote(LOTE_VALIDO);

    expect(resultado).not.toBeNull();
    expect(resultado?.numero_extintor).toBe("01");
  });

  it("retorna null e marca batch como erro_ia quando JSON é malformado", async () => {
    mockOpenAIResponse("isso não é json { broken");
    const resultado = await analisarLote(LOTE_VALIDO);

    expect(resultado).toBeNull();
    expect(fromFn).toHaveBeenCalledWith("lotes_fotos");
  });

  it("retorna null e marca erro_ia quando schema zod falha na validação", async () => {
    mockOpenAIResponse(JSON.stringify({ numero_extintor: "01" }));
    const resultado = await analisarLote(LOTE_VALIDO);

    expect(resultado).toBeNull();
    expect(fromFn).toHaveBeenCalledWith("lotes_fotos");
  });

  it("força manometro = N.A para extintor CO2 independente da resposta da IA", async () => {
    mockOpenAIResponse(RESPOSTA_CO2);
    const loteCO2: LoteFotos = { ...LOTE_VALIDO, legenda: "07" };
    const resultado = await analisarLote(loteCO2);

    expect(resultado).not.toBeNull();
    expect(resultado?.tipo_carga).toContain("CO2");
    expect(resultado?.manometro).toBe("N.A");
  });

  it("ignora lotes com status diferente de 'pronto' (idempotência)", async () => {
    const loteAnalisado: LoteFotos = { ...LOTE_VALIDO, status: "analisado" };
    const resultado = await analisarLote(loteAnalisado);

    expect(resultado).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("marca como lote_incompleto e não chama a API quando não há fotos", async () => {
    const loteSemFotos: LoteFotos = { ...LOTE_VALIDO, fotos: [] };
    const resultado = await analisarLote(loteSemFotos);

    expect(resultado).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("extrairNumeroTag", () => {
  it("aceita número puro e mantém zero à esquerda (igual à etiqueta)", () => {
    expect(extrairNumeroTag("57")).toBe("57");
    expect(extrairNumeroTag("01")).toBe("01");
    expect(extrairNumeroTag("100")).toBe("100");
    expect(extrairNumeroTag("  42 ")).toBe("42");
  });

  it("aceita etiquetas com letra e normaliza", () => {
    expect(extrairNumeroTag("A-12")).toBe("A-12");
    expect(extrairNumeroTag("r 3")).toBe("R3");
    expect(extrairNumeroTag("12b")).toBe("12B");
  });

  it("rejeita o placeholder 'Extintor'", () => {
    expect(extrairNumeroTag("Extintor")).toBeNull();
    expect(extrairNumeroTag("extintor")).toBeNull();
  });

  it("rejeita texto livre e vazio", () => {
    expect(extrairNumeroTag("foto do manometro")).toBeNull();
    expect(extrairNumeroTag("")).toBeNull();
    expect(extrairNumeroTag(null)).toBeNull();
    expect(extrairNumeroTag(undefined)).toBeNull();
  });
});
