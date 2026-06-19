// Reconciliation: compares registered device counts per type against the
// expected BOM totals and reports the gaps, so missing data is always visible
// and never silently assumed.

import { BOM_ESPERADO, TIPO_LABEL } from "./expectedBom";

export interface LinhaReconciliacao {
  tipo:        string;   // device type key
  label:       string;   // pt-BR label
  cadastrados: number;   // how many are registered (active)
  esperado:    number;   // BOM total
  faltam:      number;   // max(0, esperado - cadastrados)
  excedente:   number;   // max(0, cadastrados - esperado)
  completo:    boolean;
}

export interface Reconciliacao {
  linhas:            LinhaReconciliacao[];
  total_cadastrados: number;
  total_esperado:    number;
  total_faltam:      number;
  completo:          boolean;
}

// Pure: takes a map of {tipo -> registered count} and produces the report.
// Iterates over the BOM keys so every expected type appears even when its count
// is zero (showing the full gap), and appends any extra types found in the data.
export function reconciliar(contagens: Record<string, number>): Reconciliacao {
  const tipos = new Set<string>([...Object.keys(BOM_ESPERADO), ...Object.keys(contagens)]);

  const linhas: LinhaReconciliacao[] = [...tipos].map((tipo) => {
    const cadastrados = contagens[tipo] ?? 0;
    const esperado    = BOM_ESPERADO[tipo] ?? 0;
    const faltam      = Math.max(0, esperado - cadastrados);
    const excedente   = Math.max(0, cadastrados - esperado);
    return {
      tipo,
      label:    TIPO_LABEL[tipo] ?? tipo,
      cadastrados,
      esperado,
      faltam,
      excedente,
      completo: esperado > 0 && faltam === 0 && excedente === 0,
    };
  });

  // Order: types with a defined BOM first (by label), then extras.
  linhas.sort((a, b) => {
    const aBom = a.esperado > 0 ? 0 : 1;
    const bBom = b.esperado > 0 ? 0 : 1;
    return aBom - bBom || a.label.localeCompare(b.label, "pt-BR");
  });

  const total_cadastrados = linhas.reduce((s, l) => s + l.cadastrados, 0);
  const total_esperado    = linhas.reduce((s, l) => s + l.esperado, 0);
  const total_faltam      = linhas.reduce((s, l) => s + l.faltam, 0);

  return {
    linhas,
    total_cadastrados,
    total_esperado,
    total_faltam,
    completo: total_faltam === 0,
  };
}

// Human-readable one-line summary per type, e.g.
//   "Acionador manual: 55 de 65 — faltam 10"
export function resumoTexto(rec: Reconciliacao): string[] {
  return rec.linhas
    .filter((l) => l.esperado > 0)
    .map((l) =>
      l.faltam > 0
        ? `${l.label}: ${l.cadastrados} de ${l.esperado} — faltam ${l.faltam}`
        : l.excedente > 0
        ? `${l.label}: ${l.cadastrados} de ${l.esperado} — ${l.excedente} a mais`
        : `${l.label}: ${l.cadastrados} de ${l.esperado} — completo`
    );
}
