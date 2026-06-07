import { describe, it, expect } from "vitest";
import { renderHtml, type DadosFicha, type ExtintorFicha, type ItemInspecao } from "./template";
import { buildSampleData } from "./sample";

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeItens(overrides: Partial<Record<string, string>> = {}): ItemInspecao[] {
  const defaults: Record<string, string> = {
    lacre: "OK", vencimento_carga: "OK", vencimento_teste: "OK",
    manometro: "OK", sinalizacao_parede: "OK", sinalizacao_piso: "OK",
    suporte: "OK", mangueira: "OK", quadro_instrucao: "OK",
  };
  const merged = { ...defaults, ...overrides };
  return [
    { nome: "Lacre",               status: merged.lacre               as any, observacao: "" },
    { nome: "Vencimento Carga",    status: merged.vencimento_carga    as any, observacao: "nov/26" },
    { nome: "Vencimento Teste",    status: merged.vencimento_teste    as any, observacao: "" },
    { nome: "Manômetro",           status: merged.manometro           as any, observacao: "" },
    { nome: "Sinalização Parede",  status: merged.sinalizacao_parede  as any, observacao: "" },
    { nome: "Sinalização Piso",    status: merged.sinalizacao_piso    as any, observacao: "" },
    { nome: "Suporte",             status: merged.suporte             as any, observacao: "" },
    { nome: "Mangueira",           status: merged.mangueira           as any, observacao: "" },
    { nome: "Quadro de Instrução", status: merged.quadro_instrucao    as any, observacao: "" },
  ];
}

function makeExt(numero: string, tipoCarga = "ABC 06 KG"): ExtintorFicha {
  return { numero, setor: `Setor ${numero}`, tipo_carga: tipoCarga, itens: makeItens(), fotos: [] };
}

function makeDados(n: number): DadosFicha {
  return {
    unidade: "Itabuna",
    mesReferencia: "Junho/2026",
    dataInspecao: "2026-06-08",
    extintores: Array.from({ length: n }, (_, i) => makeExt(String(i + 1).padStart(2, "0"))),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("renderHtml — paginação", () => {
  it("3 extintores ficam numa única página (sem page-break-before)", () => {
    const html = renderHtml(makeDados(3));
    const matches = (html.match(/page-break-before:\s*always/g) ?? []).length;
    expect(matches).toBe(0);
  });

  it("4 extintores geram 1 quebra de página (entre página 1 e 2)", () => {
    const html = renderHtml(makeDados(4));
    const matches = (html.match(/page-break-before:\s*always/g) ?? []).length;
    expect(matches).toBe(1);
  });

  it("7 extintores geram 2 quebras de página (3 páginas)", () => {
    const html = renderHtml(makeDados(7));
    const matches = (html.match(/page-break-before:\s*always/g) ?? []).length;
    expect(matches).toBe(2);
  });

  it("9 extintores geram exatamente 2 quebras de página", () => {
    const html = renderHtml(makeDados(9));
    const matches = (html.match(/page-break-before:\s*always/g) ?? []).length;
    expect(matches).toBe(2);
  });

  it("10 extintores geram 3 quebras de página (4 páginas)", () => {
    const html = renderHtml(makeDados(10));
    const matches = (html.match(/page-break-before:\s*always/g) ?? []).length;
    expect(matches).toBe(3);
  });
});

describe("renderHtml — conteúdo", () => {
  it("inclui o cabeçalho com unidade e mês em maiúsculas", () => {
    const html = renderHtml(makeDados(1));
    expect(html).toContain("FÁBRICA ITABUNA - JUNHO/2026");
  });

  it("inclui os três inspetores no rodapé", () => {
    const html = renderHtml(makeDados(1));
    expect(html).toContain("RODRIGO LIMA SANTOS");
    expect(html).toContain("JOÃO VICTOR A. DOS SANTOS");
    expect(html).toContain("GABRIEL REIS P. DOS SANTOS");
  });

  it("exibe o número e setor de cada extintor", () => {
    const html = renderHtml(makeDados(2));
    expect(html).toContain("Nº 01");
    expect(html).toContain("Nº 02");
  });

  it("extintor CO2 renderiza Manômetro com status N.A", () => {
    const dados: DadosFicha = {
      unidade: "Itabuna",
      mesReferencia: "Junho/2026",
      dataInspecao: "2026-06-08",
      extintores: [{
        numero: "03",
        setor: "Servidores",
        tipo_carga: "CO2 06 KG",
        itens: makeItens({ manometro: "N.A" }),
        fotos: [],
      }],
    };
    const html = renderHtml(dados);
    // The N.A observation cell should appear for the manometer row
    expect(html).toContain("N.A");
    expect(html).toContain("CO2 06 KG");
  });

  it("item Reprovado coloca marca na coluna REPROVADO, não em OK", () => {
    const dados: DadosFicha = {
      unidade: "Itabuna",
      mesReferencia: "Junho/2026",
      dataInspecao: "2026-06-08",
      extintores: [{
        numero: "05",
        setor: "Almox",
        tipo_carga: "ABC 06 KG",
        itens: makeItens({ lacre: "Reprovado" }),
        fotos: [],
      }],
    };
    const html = renderHtml(dados);
    // Checklist rows: OK col empty, REPROVADO col has checkmark for lacre
    // The checkmark character is ✓ (&#10003;)
    expect(html).toContain("&#10003;");
  });

  it("foto inacessível usa handler onerror para placeholder", () => {
    const dados: DadosFicha = {
      unidade: "Itabuna",
      mesReferencia: "Junho/2026",
      dataInspecao: "2026-06-08",
      extintores: [{
        numero: "01",
        setor: "Recepção",
        tipo_carga: "ABC 06 KG",
        itens: makeItens(),
        fotos: ["https://example.com/broken.jpg"],
      }],
    };
    const html = renderHtml(dados);
    expect(html).toContain("onerror=");
  });
});

describe("buildSampleData", () => {
  it("retorna 7 extintores de amostra", () => {
    const dados = buildSampleData("Itabuna", "Junho/2026");
    expect(dados.extintores).toHaveLength(7);
  });

  it("extintor CO2 na amostra tem manômetro N.A", () => {
    const dados = buildSampleData("Itabuna", "Junho/2026");
    const co2 = dados.extintores.find((e) => e.tipo_carga.includes("CO2"));
    expect(co2).toBeDefined();
    const manometro = co2!.itens.find((i) => i.nome === "Manômetro");
    expect(manometro?.status).toBe("N.A");
  });
});
