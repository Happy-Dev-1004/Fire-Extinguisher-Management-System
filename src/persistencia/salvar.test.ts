import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RespostaIA } from "../analise/schema";

// ── Supabase mock ────────────────────────────────────────────────────────────
// Tracks the sequence of calls: from() → select/insert/update/upsert → eq/maybeSingle
const { fromFn, selectFn, maybeSingleFn, updateFn, insertFn, upsertFn, eqFn } =
  vi.hoisted(() => {
    const maybeSingleFn = vi.fn();
    const eqFn         = vi.fn();
    const selectFn     = vi.fn();
    const updateFn     = vi.fn();
    const insertFn     = vi.fn();
    const upsertFn     = vi.fn();
    const fromFn       = vi.fn();

    // Default chain: from().select().eq().eq().maybeSingle()
    maybeSingleFn.mockResolvedValue({ data: null, error: null });
    eqFn.mockReturnValue({ eq: eqFn, maybeSingle: maybeSingleFn });
    selectFn.mockReturnValue({ eq: eqFn });
    updateFn.mockReturnValue({ eq: eqFn });
    insertFn.mockResolvedValue({ error: null });
    upsertFn.mockResolvedValue({ error: null });

    fromFn.mockReturnValue({
      select: selectFn,
      update: updateFn,
      insert: insertFn,
      upsert: upsertFn,
    });

    return { fromFn, selectFn, maybeSingleFn, updateFn, insertFn, upsertFn, eqFn };
  });

vi.mock("../db", () => ({ supabase: { from: fromFn } }));
vi.mock("../logger", () => ({
  logger: { child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { salvarResultado, type EntradaSalvar } from "./salvar";

// ── Fixtures ─────────────────────────────────────────────────────────────────
const RESULTADO_BASE: RespostaIA = {
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
  observacoes: "Vencimento carga: nov/26",
  confianca: 0.95,
};

const ENTRADA_BASE: EntradaSalvar = {
  resultado: RESULTADO_BASE,
  loteId: "lote-abc-123",
  fotos: ["https://example.com/foto1.jpg"],
  unidadeContexto: "Itabuna",
  mesReferencia: "Junho/2026",
  dataInspecao: "2026-06-08",
};

function rewire() {
  maybeSingleFn.mockResolvedValue({ data: null, error: null });
  eqFn.mockReturnValue({ eq: eqFn, maybeSingle: maybeSingleFn });
  selectFn.mockReturnValue({ eq: eqFn });
  updateFn.mockReturnValue({ eq: eqFn });
  insertFn.mockResolvedValue({ error: null });
  upsertFn.mockResolvedValue({ error: null });
  fromFn.mockReturnValue({ select: selectFn, update: updateFn, insert: insertFn, upsert: upsertFn });
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("salvarResultado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewire();
  });

  it("extintor conhecido: atualiza o cadastro e insere a inspeção", async () => {
    // Simulate extinguisher found in registry
    maybeSingleFn.mockResolvedValueOnce({
      data: { id: "extintor-uuid-1", cadastro_pendente: false },
      error: null,
    });

    await salvarResultado(ENTRADA_BASE);

    // Registry update called
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ setor: "Recepção", tipo_carga: "ABC 06 KG" })
    );

    // Inspection upsert called with correct lote_id
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        lote_id: "lote-abc-123",
        extintor_numero: "01",
        extintor_unidade: "Itabuna",
        mes_referencia: "Junho/2026",
        tem_irregularidade: false,
      }),
      { onConflict: "lote_id" }
    );
  });

  it("extintor desconhecido: cria cadastro_pendente=true e ainda salva a inspeção", async () => {
    // extinguisher NOT found → maybySingle returns null
    maybeSingleFn.mockResolvedValueOnce({ data: null, error: null });

    await salvarResultado(ENTRADA_BASE);

    // Insert with cadastro_pendente flag
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        numero: "01",
        unidade: "Itabuna",
        cadastro_pendente: true,
      })
    );

    // Inspection still saved
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ lote_id: "lote-abc-123" }),
      { onConflict: "lote_id" }
    );
  });

  it("reprocessamento: upsert garante apenas uma linha na inspeção", async () => {
    maybeSingleFn.mockResolvedValue({
      data: { id: "extintor-uuid-1", cadastro_pendente: false },
      error: null,
    });

    // Call twice with same lote_id
    await salvarResultado(ENTRADA_BASE);
    await salvarResultado(ENTRADA_BASE);

    // upsert called twice — DB constraint prevents duplication
    expect(upsertFn).toHaveBeenCalledTimes(2);
    expect(upsertFn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ lote_id: "lote-abc-123" }),
      { onConflict: "lote_id" }
    );
    expect(upsertFn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ lote_id: "lote-abc-123" }),
      { onConflict: "lote_id" }
    );
  });

  it("item Reprovado define tem_irregularidade = true", async () => {
    maybeSingleFn.mockResolvedValueOnce({
      data: { id: "extintor-uuid-1", cadastro_pendente: false },
      error: null,
    });

    const entradaReprovada: EntradaSalvar = {
      ...ENTRADA_BASE,
      resultado: { ...RESULTADO_BASE, lacre: "Reprovado" },
    };

    await salvarResultado(entradaReprovada);

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ tem_irregularidade: true }),
      { onConflict: "lote_id" }
    );
  });

  it("nunca sobrescreve campos não vazios com valores nulos da IA", async () => {
    maybeSingleFn.mockResolvedValueOnce({
      data: { id: "extintor-uuid-1", cadastro_pendente: false },
      error: null,
    });

    const entradaNulos: EntradaSalvar = {
      ...ENTRADA_BASE,
      resultado: { ...RESULTADO_BASE, setor: null, capacidade: "" },
    };

    await salvarResultado(entradaNulos);

    // update must NOT include setor or capacidade
    const updateCall = updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateCall).not.toHaveProperty("setor");
    expect(updateCall).not.toHaveProperty("capacidade");
  });

  it("lança erro e não chama upsert quando a busca no cadastro falha", async () => {
    eqFn.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "connection lost" },
        }),
      }),
    });

    await expect(salvarResultado(ENTRADA_BASE)).rejects.toThrow("Falha na busca do cadastro");
    expect(upsertFn).not.toHaveBeenCalled();
  });
});
