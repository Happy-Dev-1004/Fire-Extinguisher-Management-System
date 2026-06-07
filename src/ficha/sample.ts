import type { DadosFicha, ExtintorFicha, ItemInspecao } from "./template";

export function buildSampleData(unidade: string, mesReferencia: string): DadosFicha {
  const statusOK = "OK"  as const;
  const statusNA = "N.A" as const;

  function sampleItens(tipoCarga: string): ItemInspecao[] {
    const isCO2 = tipoCarga.toUpperCase().includes("CO2");
    return [
      { nome: "Lacre",               status: statusOK,                   observacao: "" },
      { nome: "Vencimento Carga",    status: statusOK,                   observacao: "nov/26" },
      { nome: "Vencimento Teste",    status: statusOK,                   observacao: "" },
      { nome: "Manômetro",           status: isCO2 ? statusNA : statusOK, observacao: isCO2 ? "N.A" : "" },
      { nome: "Sinalização Parede",  status: statusOK,                   observacao: "" },
      { nome: "Sinalização Piso",    status: statusOK,                   observacao: "" },
      { nome: "Suporte",             status: statusOK,                   observacao: "" },
      { nome: "Mangueira",           status: statusOK,                   observacao: "" },
      { nome: "Quadro de Instrução", status: statusOK,                   observacao: "" },
    ];
  }

  const extintores: ExtintorFicha[] = [
    { numero: "01", setor: "Recepção",        tipo_carga: "ABC 06 KG", itens: sampleItens("ABC"), fotos: [] },
    { numero: "02", setor: "Produção A",      tipo_carga: "ABC 06 KG", itens: sampleItens("ABC"), fotos: [] },
    { numero: "03", setor: "Sala Servidores", tipo_carga: "CO2 06 KG", itens: sampleItens("CO2"), fotos: [] },
    { numero: "04", setor: "Almoxarifado",    tipo_carga: "AP 10LT",   itens: sampleItens("AP"),  fotos: [] },
    { numero: "05", setor: "Refeitório",      tipo_carga: "ABC 12 KG", itens: sampleItens("ABC"), fotos: [] },
    { numero: "06", setor: "Guarita",         tipo_carga: "ABC 06 KG", itens: sampleItens("ABC"), fotos: [] },
    { numero: "07", setor: "Laboratório",     tipo_carga: "CO2 06 KG", itens: sampleItens("CO2"), fotos: [] },
  ];

  return { unidade, mesReferencia, dataInspecao: "2026-06-08", extintores };
}
