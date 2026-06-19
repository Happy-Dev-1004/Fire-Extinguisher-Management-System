// Pure answer parsers/validators for the RDO question types. Each returns either
// { ok: true, valor } with the normalized value to store, or { ok: false, erro }
// with a pt-BR message the engine re-asks with.

import type { Pergunta } from "./perguntas";

export type Validacao =
  | { ok: true;  valor: unknown }
  | { ok: false; erro: string };

const SIM = ["sim", "s", "yes", "y", "verdadeiro", "true", "1"];
const NAO = ["não", "nao", "n", "no", "false", "0"];

const MESES_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

// Returns ISO yyyy-mm-dd or null.
export function parsearData(input: string): string | null {
  const t = input.trim().toLowerCase();
  if (t === "hoje") {
    // Caller passes "hoje" → resolved by the engine which owns the clock; here we
    // signal "today" via a sentinel the engine replaces. Keep pure: return null
    // is wrong, so we return a marker the engine handles.
    return "HOJE";
  }
  // ISO yyyy-mm-dd
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoFrom(+m[1], +m[2], +m[3]);
  // dd/mm/aaaa or dd-mm-aaaa
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let ano = +m[3]; if (ano < 100) ano += 2000;
    return isoFrom(ano, +m[2], +m[1]);
  }
  // dd/mmm or dd de mmm
  m = t.match(/^(\d{1,2})\s*(?:de)?\s*([a-zç]{3,})\.?\s*(?:de)?\s*(\d{2,4})?$/);
  if (m) {
    const mes = MESES_PT[m[2].slice(0, 3)];
    if (mes) {
      let ano = m[3] ? +m[3] : new Date().getFullYear();
      if (ano < 100) ano += 2000;
      return isoFrom(ano, mes, +m[1]);
    }
  }
  return null;
}

function isoFrom(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (isNaN(d.getTime())) return null;
  return `${ano.toString().padStart(4, "0")}-${mes.toString().padStart(2, "0")}-${dia.toString().padStart(2, "0")}`;
}

export function validarResposta(pergunta: Pergunta, textoBruto: string): Validacao {
  const texto = textoBruto.trim();

  // Optional questions accept "pular" → store empty/null.
  if (pergunta.obrigatoria === false && /^pular$/i.test(texto)) {
    return { ok: true, valor: pergunta.tipo === "numero" ? 0 : null };
  }

  switch (pergunta.tipo) {
    case "numero": {
      const m = texto.match(/^\d{1,6}$/);
      if (!m) return { ok: false, erro: "Por favor, responda com um *número* (ex.: 0, 3, 12)." };
      return { ok: true, valor: parseInt(texto, 10) };
    }
    case "data": {
      const iso = parsearData(texto);
      if (!iso) return { ok: false, erro: "Não entendi a data. Use o formato *dd/mm/aaaa* (ex.: 18/06/2026) ou responda *hoje*." };
      return { ok: true, valor: iso };
    }
    case "sim_nao": {
      const t = texto.toLowerCase();
      if (SIM.includes(t)) return { ok: true, valor: true };
      if (NAO.includes(t)) return { ok: true, valor: false };
      return { ok: false, erro: "Responda *sim* ou *não*." };
    }
    case "opcao": {
      const opcoes = pergunta.opcoes ?? [];
      // by number (1-based) or by matching the value/label
      const porNumero = parseInt(texto, 10);
      if (!isNaN(porNumero) && porNumero >= 1 && porNumero <= opcoes.length) {
        return { ok: true, valor: opcoes[porNumero - 1].valor };
      }
      const t = texto.toLowerCase();
      const hit = opcoes.find((o) => o.valor.toLowerCase() === t || o.rotulo.toLowerCase() === t);
      if (hit) return { ok: true, valor: hit.valor };
      const lista = opcoes.map((o, i) => `${i + 1}) ${o.rotulo}`).join("  ");
      return { ok: false, erro: `Opção inválida. Escolha: ${lista}` };
    }
    case "texto":
      if (!texto) return { ok: false, erro: "Resposta vazia — por favor, escreva algo (ou *pular* se permitido)." };
      return { ok: true, valor: texto };
    case "fotos":
      // handled by the engine, not here
      return { ok: true, valor: null };
  }
}
