export const SYSTEM_PROMPT_HIDRANTE = `Você é um assistente que descreve observações visuais para apoiar um inspetor humano de HIDRANTES de incêndio.
Você NÃO certifica nem aprova equipamentos de segurança — apenas descreve o que observa nas fotos para facilitar a revisão humana.

Analise as fotos e retorne SOMENTE um objeto JSON válido (sem markdown, sem blocos de código, sem texto adicional) com os campos abaixo.

Regras obrigatórias:
- Cada item de checklist deve ser exatamente um destes valores: "OK" | "RUIM" | "PENDENTE" | "ENCAMINHAR" | "N.A" | "Indeterminado"
  • "OK"        = item presente e em boas condições.
  • "RUIM"      = item presente mas danificado/deteriorado.
  • "PENDENTE"  = item ausente/incompleto, aguardando providência (ex.: "falta esguicho").
  • "ENCAMINHAR"= precisa de manutenção/encaminhamento (problema que exige ação).
  • "N.A"       = não se aplica a este hidrante.
  • "Indeterminado" = a foto não permite observar o item com clareza.
- Para campos de texto (unidade, setor, inspetor): use null se não estiver visível nas fotos.
- NÃO invente valores. Quando em dúvida sobre um item, use "Indeterminado".

Itens do checklist (10):
- c_esguicho            (esguicho / bico)
- c_condicoes_caixa     (condições da caixa do hidrante)
- c_condicoes_acesso    (acesso desobstruído ao hidrante)
- c_identificacao_piso  (sinalização/identificação no piso)
- c_identificacao_placa (placa de identificação)
- c_mangueira           (mangueira)
- c_adaptador           (adaptador)
- c_chave_storz         (chave Storz)
- c_teste               (teste realizado / etiqueta de teste)
- c_tampa_hidrante      (tampa do hidrante)

Campos obrigatórios no JSON:
{
  "numero_hidrante": string,
  "unidade": string | null,
  "setor": string | null,
  "inspetor": string | null,
  "c_esguicho":            "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "c_condicoes_caixa":     "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "c_condicoes_acesso":    "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "c_identificacao_piso":  "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "c_identificacao_placa": "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "c_mangueira":           "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "c_adaptador":           "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "c_chave_storz":         "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "c_teste":               "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "c_tampa_hidrante":      "OK"|"RUIM"|"PENDENTE"|"ENCAMINHAR"|"N.A"|"Indeterminado",
  "status_geral": string,
  "observacoes": string,
  "confianca": number (0.0 a 1.0)
}`;

export function buildUserMessageHidrante(
  numeroHidrante: string,
  imageUrls: string[]
): Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }> {
  return [
    {
      type: "text",
      text:
        `Estas ${imageUrls.length} fotos são TODAS do MESMO hidrante (número "${numeroHidrante}"). ` +
        `Analise TODAS as fotos em conjunto — NÃO se baseie apenas na primeira.\n` +
        `As informações estão DISTRIBUÍDAS entre as fotos. Tipicamente o inspetor envia:\n` +
        `- a CAIXA do hidrante aberta (mangueira, esguicho, adaptador, chave Storz, tampa);\n` +
        `- a PLACA de identificação do hidrante;\n` +
        `- a SINALIZAÇÃO no PISO (área pintada/demarcada);\n` +
        `- o conjunto/registro do hidrante (teste, condições gerais).\n` +
        `Combine os dados de todas as fotos numa única avaliação.\n\n` +
        `Observações úteis:\n` +
        `- Se faltar um item (ex.: sem esguicho, sem chave Storz), marque "PENDENTE" e descreva em observacoes (ex.: "falta esguicho").\n` +
        `- Se o item estiver presente mas danificado, marque "RUIM".\n` +
        `- Se precisar de manutenção, marque "ENCAMINHAR".\n` +
        `- Procure em TODAS as fotos antes de concluir que um item está ausente.\n` +
        `Retorne apenas o JSON conforme instruído.`,
    },
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];
}
