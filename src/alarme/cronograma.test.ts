import { describe, it, expect } from "vitest";
import { diasEntre, resumirAreaFabrica, type AreaCronograma } from "./cronogramaCalculo";

// Minimal área builder — only the fields the functions under test read.
function area(over: Partial<AreaCronograma> = {}): AreaCronograma {
  return {
    central_id: "c1", central_numero: 1, central_nome: "Central 1",
    setor: "Setor", total: 10,
    pendente: 0, instalado: 0, enderecado: 0, testado: 10,
    concluidos: 10, faltam: 0, pct: 100,
    data_prevista: null, observacoes: null, sistema_antigo: null,
    pct_area: null,
    data_inicio_prevista: null, data_entrega_prevista: null,
    data_inicio_real: null, data_fim_real: null,
    duracao_prevista_dias: null, duracao_real_dias: null,
    situacao: "concluido",
    ...over,
  };
}

describe("diasEntre — duração em dias corridos", () => {
  it("mesmo dia conta 1 dia (início e fim inclusivos)", () => {
    expect(diasEntre("2026-09-15", "2026-09-15")).toBe(1);
  });

  it("conta o primeiro e o último dia", () => {
    // 15 a 20 de setembro = 6 dias (15,16,17,18,19,20)
    expect(diasEntre("2026-09-15", "2026-09-20")).toBe(6);
  });

  it("atravessa a virada de mês", () => {
    // 28/02 a 02/03/2026 (não bissexto): 28, 1, 2 = 3 dias
    expect(diasEntre("2026-02-28", "2026-03-02")).toBe(3);
  });

  it("devolve null quando falta uma das datas", () => {
    expect(diasEntre(null, "2026-09-20")).toBeNull();
    expect(diasEntre("2026-09-15", null)).toBeNull();
    expect(diasEntre(null, null)).toBeNull();
  });

  it("devolve null quando o fim é anterior ao início", () => {
    expect(diasEntre("2026-09-20", "2026-09-15")).toBeNull();
  });

  it("devolve null para data inválida", () => {
    expect(diasEntre("nao-e-data", "2026-09-20")).toBeNull();
  });
});

describe("resumirAreaFabrica — soma do % de área", () => {
  it("soma só as áreas concluídas no atendido, mas todas no cadastrado", () => {
    const r = resumirAreaFabrica([
      area({ pct_area: 1.5, situacao: "concluido" }),
      area({ pct_area: 2.5, situacao: "no_prazo" }),
      area({ pct_area: 1.0, situacao: "atrasado" }),
    ]);
    expect(r.pct_atendido).toBe(1.5);
    expect(r.pct_cadastrado).toBe(5);
    expect(r.areas_com_pct).toBe(3);
  });

  it("ignora áreas sem percentual preenchido", () => {
    const r = resumirAreaFabrica([
      area({ pct_area: 1.5, situacao: "concluido" }),
      area({ pct_area: null, situacao: "concluido" }),
    ]);
    expect(r.pct_atendido).toBe(1.5);
    expect(r.areas_com_pct).toBe(1);
  });

  it("não acumula ruído de ponto flutuante", () => {
    // 0.1 + 0.2 = 0.30000000000000004 em float puro.
    const r = resumirAreaFabrica([
      area({ pct_area: 0.1, situacao: "concluido" }),
      area({ pct_area: 0.2, situacao: "concluido" }),
    ]);
    expect(r.pct_atendido).toBe(0.3);
  });

  it("lista vazia devolve zeros", () => {
    expect(resumirAreaFabrica([])).toEqual({ pct_cadastrado: 0, pct_atendido: 0, areas_com_pct: 0 });
  });
});
