import { describe, it, expect } from "vitest";
import { renderHtmlCronograma } from "./gerarCronogramaPdf";
import type { AreaCronograma } from "../alarme/cronogramaCalculo";

function area(over: Partial<AreaCronograma> = {}): AreaCronograma {
  return {
    central_id: "c1", central_numero: 1, central_nome: "Central 1",
    setor: "Linha de Separação", total: 10,
    pendente: 5, instalado: 3, enderecado: 1, testado: 1,
    concluidos: 1, faltam: 9, pct: 10,
    data_prevista: null, observacoes: null, sistema_antigo: null,
    pct_area: null,
    data_inicio_prevista: null, data_entrega_prevista: null,
    data_inicio_real: null, data_fim_real: null,
    duracao_prevista_dias: null, duracao_real_dias: null,
    situacao: "sem_data",
    ...over,
  };
}

describe("renderHtmlCronograma — colunas de planejamento", () => {
  it("mostra os cabeçalhos agrupados PREVISTO e REALIZADO", () => {
    const html = renderHtmlCronograma([area()]);
    expect(html).toContain("PREVISTO");
    expect(html).toContain("REALIZADO");
    expect(html).toContain("DURAÇÃO");
    expect(html).toContain("% DA");
  });

  it("imprime o percentual da área com vírgula decimal", () => {
    const html = renderHtmlCronograma([area({ pct_area: 1.5 })]);
    expect(html).toContain("1,5%");
  });

  it("percentual não preenchido vira travessão", () => {
    const html = renderHtmlCronograma([area({ pct_area: null })]);
    // a célula de % da área fica com "—" (mesmo placeholder das datas vazias)
    expect(html).toContain("—");
  });

  it("imprime as datas previstas e reais em dd/mm/aaaa", () => {
    const html = renderHtmlCronograma([area({
      data_inicio_prevista: "2026-09-15",
      data_entrega_prevista: "2026-09-20",
      data_inicio_real: "2026-09-16",
      data_fim_real: "2026-09-22",
    })]);
    expect(html).toContain("15/09/2026");
    expect(html).toContain("20/09/2026");
    expect(html).toContain("16/09/2026");
    expect(html).toContain("22/09/2026");
  });

  it("imprime as durações calculadas em dias", () => {
    const html = renderHtmlCronograma([area({
      duracao_prevista_dias: 6,
      duracao_real_dias: 7,
    })]);
    expect(html).toContain("6 d");
    expect(html).toContain("7 d");
  });

  it("mostra a área atendida somando só as concluídas", () => {
    const html = renderHtmlCronograma([
      area({ pct_area: 1.5, situacao: "concluido" }),
      area({ pct_area: 2.5, situacao: "no_prazo", setor: "Outra" }),
    ]);
    expect(html).toContain("Área atendida");
    expect(html).toContain("1,5%");   // atendido
    expect(html).toContain("4%");     // cadastrado (1.5 + 2.5)
  });

  it("mantém a coluna SISTEMA ANTIGO com Sim/Não", () => {
    const sim = renderHtmlCronograma([area({ sistema_antigo: true })]);
    const nao = renderHtmlCronograma([area({ sistema_antigo: false })]);
    expect(sim).toContain("Sim");
    expect(nao).toContain("Não");
  });

  it("lista vazia rende o aviso, sem quebrar", () => {
    const html = renderHtmlCronograma([]);
    expect(html).toContain("Nenhuma área cadastrada");
  });
});
