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
- ATENÇÃO aos acessórios pequenos — esguicho (c_esguicho), adaptador (c_adaptador) e chave Storz (c_chave_storz): são parecidos entre si e fáceis de confundir. Só marque "OK" se conseguir confirmar com clareza o acessório correto e em boas condições. Se não tiver certeza de qual é o acessório, ou se a foto não permitir contá-lo/identificá-lo, use "Indeterminado" (nunca "OK" por suposição).
- Quando o usuário informar a QUANTIDADE esperada de um acessório, baseie-se nela: confirme se aquela quantidade está presente; se houver menos, marque "PENDENTE".

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

// Expected accessory counts registered for THIS hydrant (constants). Any field
// may be null/absent when not registered. Used to turn the hard "identify this
// small part" task into the easier "verify the N expected parts are present".
export interface EsperadoHidrante {
  esguicho?: string | null;    // expected nozzle count, e.g. "2"
  mangueira?: string | null;   // expected hose count, e.g. "4"
  chave_storz?: string | null; // expected Storz-wrench count, e.g. "2"
}

// Builds the "este hidrante DEVE ter…" verification block from the registered
// constants. Returns "" when nothing is registered (no false expectations).
function blocoEsperado(esperado?: EsperadoHidrante): string {
  if (!esperado) return "";
  const linhas: string[] = [];
  const fmt = (n: string | null | undefined, sing: string, plur: string) => {
    const v = (n ?? "").trim();
    if (!v) return null;
    const num = Number(v);
    const nome = Number.isFinite(num) && num === 1 ? sing : plur;
    return `${v} ${nome}`;
  };
  const eg = fmt(esperado.esguicho, "esguicho", "esguichos");
  const mg = fmt(esperado.mangueira, "mangueira", "mangueiras");
  const cs = fmt(esperado.chave_storz, "chave Storz", "chaves Storz");
  if (eg) linhas.push(`  • c_esguicho:    esperado ${eg}`);
  if (mg) linhas.push(`  • c_mangueira:   esperado ${mg}`);
  if (cs) linhas.push(`  • c_chave_storz: esperado ${cs}`);
  if (linhas.length === 0) return "";
  return (
    `\nESTE hidrante TEM, no cadastro, a seguinte quantidade de acessórios:\n` +
    linhas.join("\n") + `\n` +
    `Não é preciso adivinhar o que cada acessório é — apenas VERIFIQUE, nas fotos, se a quantidade esperada está presente e em boas condições:\n` +
    `- Se a quantidade esperada está presente e íntegra → "OK".\n` +
    `- Se há menos do que o esperado (ex.: deveria ter 2 esguichos e você vê 1, ou nenhum) → "PENDENTE" e descreva em observacoes (ex.: "falta 1 esguicho").\n` +
    `- Se está presente mas danificado/deteriorado → "RUIM".\n` +
    `- Se NÃO conseguir ver/contar o acessório com clareza na foto → "Indeterminado" (NUNCA marque "OK" no que não conseguir confirmar).\n`
  );
}

export function buildUserMessageHidrante(
  numeroHidrante: string,
  imageUrls: string[],
  esperado?: EsperadoHidrante,
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
        `Combine os dados de todas as fotos numa única avaliação.\n` +
        blocoEsperado(esperado) +
        `\nObservações úteis:\n` +
        `- Os acessórios pequenos (esguicho/bico, adaptador, chave Storz) são difíceis de distinguir. Na dúvida sobre QUAL é o item ou se ele está presente, prefira "Indeterminado" a "OK".\n` +
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
