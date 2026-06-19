import { describe, it, expect } from "vitest";
import { validarResposta, parsearData } from "./validacao";
import type { Pergunta } from "./perguntas";

const num: Pergunta  = { key: "n", pergunta: "?", tipo: "numero", destino: { coluna: "x" } };
const data: Pergunta = { key: "d", pergunta: "?", tipo: "data",   destino: { coluna: "data" } };
const sn: Pergunta   = { key: "s", pergunta: "?", tipo: "sim_nao",destino: { coluna: "b" } };
const opc: Pergunta  = { key: "o", pergunta: "?", tipo: "opcao",  destino: { coluna: "p" },
  opcoes: [{ valor: "diurno", rotulo: "Diurno" }, { valor: "noturno", rotulo: "Noturno" }] };
const txtOpt: Pergunta = { key: "t", pergunta: "?", tipo: "texto", destino: { coluna: "t" }, obrigatoria: false };

describe("validarResposta", () => {
  it("numero: aceita inteiro, rejeita texto", () => {
    expect(validarResposta(num, "12")).toEqual({ ok: true, valor: 12 });
    const r = validarResposta(num, "doze");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("número");
  });

  it("data: aceita dd/mm/aaaa e 'hoje' (sentinela)", () => {
    expect(validarResposta(data, "18/06/2026")).toEqual({ ok: true, valor: "2026-06-18" });
    expect(validarResposta(data, "hoje")).toEqual({ ok: true, valor: "HOJE" });
    expect(validarResposta(data, "32/13/2026").ok).toBe(false);
  });

  it("sim_nao: mapeia sim/não para boolean", () => {
    expect(validarResposta(sn, "Sim")).toEqual({ ok: true, valor: true });
    expect(validarResposta(sn, "não")).toEqual({ ok: true, valor: false });
    expect(validarResposta(sn, "talvez").ok).toBe(false);
  });

  it("opcao: aceita por número e por rótulo", () => {
    expect(validarResposta(opc, "1")).toEqual({ ok: true, valor: "diurno" });
    expect(validarResposta(opc, "Noturno")).toEqual({ ok: true, valor: "noturno" });
    expect(validarResposta(opc, "9").ok).toBe(false);
  });

  it("optional question: 'pular' grava null", () => {
    expect(validarResposta(txtOpt, "pular")).toEqual({ ok: true, valor: null });
  });

  it("parsearData formatos variados", () => {
    expect(parsearData("2026-06-18")).toBe("2026-06-18");
    expect(parsearData("18/6/26")).toBe("2026-06-18");
    expect(parsearData("18 jun 2026")).toBe("2026-06-18");
    expect(parsearData("banana")).toBeNull();
  });
});
