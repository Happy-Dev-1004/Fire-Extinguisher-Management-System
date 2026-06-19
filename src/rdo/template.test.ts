import { describe, it, expect } from "vitest";
import { renderRdoHtml, type DadosRdoPdf } from "./template";

function base(overrides: Partial<DadosRdoPdf> = {}): DadosRdoPdf {
  return {
    numeroRdo: null,
    data: "2026-06-18",
    responsavel: "Joao Silva",
    periodo: "diurno",
    clima: "Ensolarado",
    central: "Central 3 - Fabrica",
    laco: null,
    frente_trabalho: "Torrefacao",
    efetivo: { eletricistas: 4, ajudantes: 3, tecnicos: 1, supervisores: 1 },
    atividades: { infraestrutura: "Eletrocalha", cabeamento: null, montagem: "5 detectores", programacao: null },
    dispositivos_instalados: { detector_fumaca: 5, acionador: 2, sirene: 2 },
    pt_numero: "PT-1234",
    integracao_novos: true,
    ocorrencias: "Sem ocorrencias",
    atrasos: { descricao: null },
    planejamento_proximo_dia: "Continuar",
    status: "concluido",
    fotosDataUris: [],
    dispositivosInstalados: [],
    dashboardBaseUrl: "https://app.exemplo.com",
    ...overrides,
  };
}

describe("RDO PDF template", () => {
  it("renders all 8 sections + the header", () => {
    const html = renderRdoHtml(base());
    expect(html).toContain("RELATÓRIO DIÁRIO DE OBRA (RDO)");
    expect(html).toContain("Identificação");
    expect(html).toContain("Localização / Frente de trabalho");
    expect(html).toContain("Efetivo em campo");
    expect(html).toContain("Atividades executadas");
    expect(html).toContain("Dispositivos instalados hoje");
    expect(html).toContain("Segurança / Integração");
    expect(html).toContain("Ocorrências, atrasos e planejamento");
    expect(html).toContain("Registro fotográfico do dia");
    expect(html).toContain("Registro fotográfico dos dispositivos instalados hoje");
  });

  it("formats the date as dd/mm/aaaa and shows captured values", () => {
    const html = renderRdoHtml(base());
    expect(html).toContain("18/06/2026");
    expect(html).toContain("Joao Silva");
    expect(html).toContain("Diurno");
    expect(html).toContain("Torrefacao");
    expect(html).toContain("PT-1234");
  });

  it("computes the efetivo and dispositivos totals", () => {
    const html = renderRdoHtml(base());
    expect(html).toContain("Total em campo");
    expect(html).toMatch(/Total em campo<\/td><td class="val">9</);     // 4+3+1+1
    expect(html).toMatch(/Total instalado hoje<\/td><td class="val">9</); // 5+2+2
  });

  it("embeds the day's photos as <img> when present", () => {
    const html = renderRdoHtml(base({
      fotosDataUris: ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"],
    }));
    expect(html).toContain(`src="data:image/jpeg;base64,AAAA"`);
    expect(html).toContain(`src="data:image/jpeg;base64,BBBB"`);
    expect(html).not.toContain("Nenhuma foto de andamento");
  });

  it("handles a zero-photo day gracefully", () => {
    const html = renderRdoHtml(base({ fotosDataUris: [] }));
    expect(html).toContain("Nenhuma foto de andamento foi registrada neste dia.");
    expect(html).not.toContain("<img class=\"foto\"");
  });

  it("renders working absolute links to the device galleries", () => {
    const html = renderRdoHtml(base({
      dispositivosInstalados: [
        { setor: "Torrefacao", endereco: "L1.05", laco: 1, tipo_dispositivo: "sirene", qtd_fotos: 3, link_galeria: "/alarme/fotos?data=2026-06-18" },
      ],
    }));
    expect(html).toContain("https://app.exemplo.com/alarme/fotos?data=2026-06-18");
    expect(html).toContain("abrir galeria");
    expect(html).toContain("Sirene");
    expect(html).toContain("3 foto(s)");
  });

  it("uses relative links when no dashboard base url is configured", () => {
    const html = renderRdoHtml(base({
      dashboardBaseUrl: null,
      dispositivosInstalados: [
        { setor: "X", endereco: null, laco: 2, tipo_dispositivo: "acionador", qtd_fotos: 1, link_galeria: "/alarme/fotos?data=2026-06-18" },
      ],
    }));
    expect(html).toContain(`href="/alarme/fotos?data=2026-06-18"`);
  });

  it("shows a friendly note when no devices were installed that day", () => {
    const html = renderRdoHtml(base({ dispositivosInstalados: [] }));
    expect(html).toContain("Nenhum dispositivo foi marcado como instalado nesta data ainda.");
  });

  it("shows '—' for blank/incomplete fields instead of empty cells", () => {
    const html = renderRdoHtml(base({
      laco: null, ocorrencias: null, clima: null, pt_numero: null,
    }));
    // laço and other blanks render as the em-dash placeholder
    expect(html).toContain("—");
  });

  it("escapes HTML in user-provided text", () => {
    const html = renderRdoHtml(base({ responsavel: "<script>alert(1)</script>" }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
