import { logger } from "../logger";

export type Situacao = "descartado" | "vencido" | "proximo" | "em_dia" | "indeterminado";

// How many days ahead counts as "proximo do vencimento"
const DIAS_AVISO = 60;

const MESES: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

/**
 * Parses a vencimento string into a Date representing end-of-month.
 * Accepted formats:
 *   "nov/26", "nov/2026"     — pt-BR abbreviated month / year
 *   "04/2026", "04-2026"     — numeric MM/YYYY
 *   "18/08/2026"             — full DD/MM/YYYY (day is ignored; uses end of that month)
 *   "2029"                   — year only (treated as end of December)
 *
 * Returns null if the value is missing, empty, or unparseable — never throws.
 */
export function parsearVencimento(
  valor: string | null | undefined,
  contexto: string,
): Date | null {
  if (!valor?.trim()) return null;

  const raw = valor.trim().toLowerCase();

  // "mmm/YY" or "mmm/YYYY" — pt-BR abbreviated month
  const matchAbrev = raw.match(/^([a-zçãõ]{2,4})[\/\-](\d{2,4})$/);
  if (matchAbrev) {
    const mesAbrev = matchAbrev[1].slice(0, 3);
    const mesIdx = MESES[mesAbrev];
    if (mesIdx === undefined) {
      logger.warn({ valor, mesAbrev, contexto }, "mês abreviado não reconhecido — marcado como indeterminado");
      return null;
    }
    let ano = parseInt(matchAbrev[2], 10);
    if (ano < 100) ano += 2000;
    return endOfMonth(ano, mesIdx, valor, contexto);
  }

  // "DD/MM/YYYY" or "DD-MM-YYYY" — full date, ignore day
  const matchFull = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (matchFull) {
    const mes = parseInt(matchFull[2], 10) - 1; // 0-based
    let ano = parseInt(matchFull[3], 10);
    if (ano < 100) ano += 2000;
    if (mes < 0 || mes > 11) {
      logger.warn({ valor, contexto }, "mês fora do intervalo — marcado como indeterminado");
      return null;
    }
    return endOfMonth(ano, mes, valor, contexto);
  }

  // "MM/YYYY" or "MM-YYYY" — numeric month/year
  const matchMonthYear = raw.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (matchMonthYear) {
    const mes = parseInt(matchMonthYear[1], 10) - 1;
    const ano = parseInt(matchMonthYear[2], 10);
    if (mes < 0 || mes > 11) {
      logger.warn({ valor, contexto }, "mês fora do intervalo — marcado como indeterminado");
      return null;
    }
    return endOfMonth(ano, mes, valor, contexto);
  }

  // "YYYY" — year only, treat as end of December
  const matchYear = raw.match(/^(\d{4})$/);
  if (matchYear) {
    const ano = parseInt(matchYear[1], 10);
    return endOfMonth(ano, 11, valor, contexto); // December
  }

  logger.warn({ valor, contexto }, "vencimento com formato não reconhecido — marcado como indeterminado");
  return null;
}

function endOfMonth(ano: number, mes: number, valor: string, contexto: string): Date | null {
  // day 0 of the *next* month = last day of current month
  const fim = new Date(ano, mes + 1, 0, 23, 59, 59, 999);
  if (isNaN(fim.getTime())) {
    logger.warn({ valor, contexto }, "data inválida após parse — marcado como indeterminado");
    return null;
  }
  return fim;
}

/**
 * Computes the situacao of a single extinguisher based on today's date.
 *
 * Priority order:
 *   1. descartado  — status_ativo === false
 *   2. indeterminado — both vencimentos are missing/unparseable
 *   3. vencido     — any vencimento is in the past
 *   4. proximo     — any vencimento is within DIAS_AVISO days
 *   5. em_dia      — both are in the future beyond DIAS_AVISO
 */
export function calcularSituacao(extintor: {
  status_ativo?: boolean | null;
  vencimento_carga?: string | null;
  vencimento_teste?: string | null;
  numero?: string;
  unidade?: string;
}): Situacao {
  if (extintor.status_ativo === false) return "descartado";

  const ctx = `extintor ${extintor.numero ?? "?"} @ ${extintor.unidade ?? "?"}`;
  const dCarga = parsearVencimento(extintor.vencimento_carga, `${ctx} vencimento_carga`);
  const dTeste = parsearVencimento(extintor.vencimento_teste, `${ctx} vencimento_teste`);

  if (dCarga === null && dTeste === null) return "indeterminado";

  const agora = new Date();
  const limiteProximo = new Date(agora.getTime() + DIAS_AVISO * 24 * 60 * 60 * 1000);

  // Vencido: at least one parseable date is in the past
  const cargaVencida = dCarga !== null && dCarga < agora;
  const testeVencido = dTeste !== null && dTeste < agora;
  if (cargaVencida || testeVencido) return "vencido";

  // Proximo: at least one parseable date is within the warning window
  const cargaProxima = dCarga !== null && dCarga <= limiteProximo;
  const testeProximo = dTeste !== null && dTeste <= limiteProximo;
  if (cargaProxima || testeProximo) return "proximo";

  return "em_dia";
}
