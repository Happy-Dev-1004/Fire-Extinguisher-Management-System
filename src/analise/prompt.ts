export const SYSTEM_PROMPT = `Você é um assistente que descreve observações visuais para apoiar um inspetor humano de extintores de incêndio.
Você NÃO certifica nem aprova equipamentos de segurança — apenas descreve o que observa nas fotos para facilitar a revisão humana.

Analise as fotos e retorne SOMENTE um objeto JSON válido (sem markdown, sem blocos de código, sem texto adicional) com os campos abaixo.

Regras obrigatórias:
- Cada item de checklist deve ser exatamente um destes valores: "OK" | "Reprovado" | "N.A" | "Indeterminado"
- Se tipo_carga for CO2, defina manometro como "N.A" (extintores CO2 não possuem manômetro)
- Para ambientes externos (área externa), sinalizacao_piso pode ser "N.A"
- Use "Indeterminado" quando a foto não permite observar o item com clareza
- Para campos de texto (unidade, setor, inspetor): use null se não estiver visível nas fotos
- Para vencimento_carga e vencimento_teste: LEIA exatamente o que está impresso/escrito na etiqueta, dígito por dígito. NUNCA invente, deduza ou arredonde uma data. Informe no formato "MM/AAAA" (ex: "04/2026") ou "mmm/AAAA" (ex: "abr/2026"). Se só o ano estiver visível, use "12/AAAA". Se a data não estiver visível ou você tiver QUALQUER dúvida sobre algum dígito, use "" e marque o status correspondente como "Indeterminado". É melhor "Indeterminado" do que uma data errada.
- Diferencie carga (recarga do agente extintor) de teste hidrostático: são duas datas distintas, geralmente em linhas separadas da etiqueta. Não troque uma pela outra.

Campos obrigatórios no JSON:
{
  "numero_extintor": string,
  "unidade": string | null,
  "setor": string | null,
  "tipo_carga": string,
  "capacidade": string,
  "vencimento_carga": string,
  "vencimento_teste": string,
  "inspetor": string | null,
  "lacre": "OK"|"Reprovado"|"N.A"|"Indeterminado",
  "vencimento_carga_status": "OK"|"Reprovado"|"N.A"|"Indeterminado",
  "vencimento_teste_status": "OK"|"Reprovado"|"N.A"|"Indeterminado",
  "manometro": "OK"|"Reprovado"|"N.A"|"Indeterminado",
  "sinalizacao_parede": "OK"|"Reprovado"|"N.A"|"Indeterminado",
  "sinalizacao_piso": "OK"|"Reprovado"|"N.A"|"Indeterminado",
  "suporte": "OK"|"Reprovado"|"N.A"|"Indeterminado",
  "mangueira": "OK"|"Reprovado"|"N.A"|"Indeterminado",
  "quadro_instrucao": "OK"|"Reprovado"|"N.A"|"Indeterminado",
  "status_geral": string,
  "observacoes": string,
  "confianca": number (0.0 a 1.0)
}`;

export function buildUserMessage(
  numeroExtintor: string,
  imageUrls: string[]
): Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } }> {
  return [
    {
      type: "text",
      text:
        `Estas ${imageUrls.length} fotos são TODAS do MESMO extintor (número "${numeroExtintor}"). ` +
        `Analise TODAS as fotos em conjunto — NÃO se baseie apenas na primeira.\n` +
        `As informações estão DISTRIBUÍDAS entre as fotos. Tipicamente o inspetor envia 4 a 6 fotos por extintor:\n` +
        `- uma foto da ETIQUETA/SELO de manutenção (contém os VENCIMENTOS de carga e teste, tipo, capacidade, nº);\n` +
        `- uma foto do MANÔMETRO (pressão / ponteiro na faixa verde ou vermelha);\n` +
        `- uma foto do EXTINTOR inteiro na parede (suporte, mangueira, sinalização de parede);\n` +
        `- uma foto do PISO / localização (sinalização de piso).\n` +
        `Combine os dados de todas as fotos numa única avaliação. Cada campo deve usar a foto onde aquele dado aparece.\n\n` +
        `LEITURA DE DADOS IMPRESSOS/MANUSCRITOS (datas de vencimento):\n` +
        `- Localize a ETIQUETA de manutenção e transcreva LITERALMENTE as datas (ex.: "Vencimento 2º Nível 04/05/2027", "3º Nível 2028").\n` +
        `- Leia dígito por dígito. Não deduza, não arredonde, não invente.\n` +
        `- vencimento_carga = recarga (2º nível). vencimento_teste = teste hidrostático (3º nível). São datas diferentes.\n` +
        `- Procure em TODAS as fotos antes de concluir que um dado está ausente.\n` +
        `- Só use "" + "Indeterminado" se a etiqueta realmente não estiver legível em NENHUMA foto.\n` +
        `Retorne apenas o JSON conforme instruído.`,
    },
    // detail: "high" forces GPT-4o to process the image at full resolution.
    // Without it the model uses a low-res downscale, which makes small printed
    // dates and handwritten labels unreadable — the main cause of wrong dates.
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];
}
