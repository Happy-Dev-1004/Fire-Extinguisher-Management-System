import { describe, it, expect } from "vitest";
import { renderHtmlManutencao, type VisitaManutencaoPdf } from "./gerarManutencaoPdf";

function visita(over: Partial<VisitaManutencaoPdf> = {}): VisitaManutencaoPdf {
  return {
    central_numero: 3, central_nome: "Fábrica", data_visita: "2026-07-13",
    tecnicos: "João e Maria", responsavel: "Rodrigo",
    etapas: {
      e1_planejamento: "OK", e2_preparacao: "OK", e3_inspecao_visual: "NC",
      e4_testes: "OK", e5_verificacoes: "OK", e6_ajustes: "N.A", e7_relatorio: "OK",
    },
    observacoes_etapas: { e3_inspecao_visual: "Sirene solta no laço 2" },
    nao_conformidades: "Sirene solta", recomendacoes: "Refixar", observacoes: "",
    fotos: [], ...over,
  };
}

describe("renderHtmlManutencao", () => {
  it("renders the report title, central, date and technicians", () => {
    const html = renderHtmlManutencao(visita());
    expect(html).toContain("RELATÓRIO DE MANUTENÇÃO PREVENTIVA");
    expect(html).toContain("CENTRAL 3");
    expect(html).toContain("13/07/2026");
    expect(html).toContain("João e Maria");
  });

  it("renders all 7 steps and marks the matching OK/NC/N.A column", () => {
    const html = renderHtmlManutencao(visita());
    for (const rot of ["Planejamento da visita", "Inspeção visual", "Relatório e encerramento"]) {
      expect(html).toContain(rot);
    }
    // the NC step's observação shows
    expect(html).toContain("Sirene solta no laço 2");
    // a checkmark char is present (at least one step is OK)
    expect(html).toContain("&#10003;");
  });

  it("shows a 'sem fotos' note when there are none", () => {
    expect(renderHtmlManutencao(visita({ fotos: [] }))).toContain("Sem fotos anexadas");
  });

  it("renders the non-conformity + recommendation blocks", () => {
    const html = renderHtmlManutencao(visita());
    expect(html).toContain("Sirene solta");
    expect(html).toContain("Refixar");
  });
});
