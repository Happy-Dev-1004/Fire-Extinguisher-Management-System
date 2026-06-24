import { describe, it, expect } from "vitest";
import { renderHtmlHidrante, type DadosFichaHidrante } from "./templateHidrante";

function dados(over: Partial<DadosFichaHidrante> = {}): DadosFichaHidrante {
  return {
    unidade: "EDP",
    mesReferencia: "Março/2026",
    dataInspecao: "",
    hidrantes: [
      {
        numero: "H01", setor: "Portaria", fotos: [],
        itens: [
          { nome: "Esguicho", status: "OK", observacao: "" },
          { nome: "Mangueira", status: "PENDENTE", observacao: "Falta 02 esguicho" },
          { nome: "Chave Storz", status: "RUIM", observacao: "" },
          { nome: "Teste", status: "ENCAMINHAR", observacao: "" },
        ],
      },
    ],
    ...over,
  };
}

describe("renderHtmlHidrante", () => {
  it("renders the hydrant ficha title + unit bar", () => {
    const html = renderHtmlHidrante(dados());
    expect(html).toContain("FICHA DE INSPEÇÃO MENSAL DOS HIDRANTES");
    expect(html).toContain("EDP");
    expect(html).toContain("MARÇO/2026");
  });

  it("renders the 4 status columns (OK / RUIM / PENDENTE / ENCAMINHAR MANUTENÇÃO)", () => {
    const html = renderHtmlHidrante(dados());
    expect(html).toContain(">OK<");
    expect(html).toContain(">RUIM<");
    expect(html).toContain(">PENDENTE<");
    // "ENCAMINHAR MANUTENÇÃO" renders as two stacked vertical lines (two spans),
    // matching the original form — assert the actual split markup, not the
    // contiguous label (which would also match the CSS comment).
    expect(html).toContain(">ENCAMINHAR</span><span>MANUTENÇÃO<");
  });

  it("checks the matching column and shows the observação", () => {
    const html = renderHtmlHidrante(dados());
    expect(html).toContain("Hidrante H01");
    expect(html).toContain("Esguicho");
    expect(html).toContain("Falta 02 esguicho"); // observação rendered
  });

  it("shows a 'não inspecionado' note for empty hydrants", () => {
    const html = renderHtmlHidrante(dados({
      hidrantes: [{ numero: "H02", setor: "X", fotos: [], naoInspecionado: true,
        itens: [{ nome: "Esguicho", status: "", observacao: "" }] }],
    }));
    expect(html).toContain("Não inspecionado neste mês");
  });
});
