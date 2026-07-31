// Pure calculations for the alarm execution schedule. Kept apart from
// cronograma.ts (which imports the Supabase admin client) so these can be
// unit-tested — and reused by the PDF — without any database credentials.

export type SituacaoCronograma = "concluido" | "no_prazo" | "atrasado" | "sem_data";

export interface AreaCronograma {
  central_id: string;
  central_numero: number | null;
  central_nome: string | null;
  setor: string;
  total: number;
  pendente: number;
  instalado: number;
  enderecado: number;
  testado: number;
  concluidos: number;   // "entregue" = testado
  faltam: number;
  pct: number;
  data_prevista: string | null;
  observacoes: string | null;
  // Área já possui equipamento no sistema antigo? true=Sim, false=Não, null=não respondido.
  sistema_antigo: boolean | null;
  // Quanto esta área representa da área TOTAL da fábrica (ex.: 1.5 = 1,5%).
  // Preenchido à mão pelo cliente; conta para o atendido quando a área conclui.
  pct_area: number | null;
  // Planejamento e execução (todas preenchidas à mão).
  data_inicio_prevista: string | null;
  data_entrega_prevista: string | null;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  // Derivadas das datas acima — nunca gravadas, sempre calculadas.
  duracao_prevista_dias: number | null;
  duracao_real_dias: number | null;
  situacao: SituacaoCronograma;
}

// Totais de área da fábrica: quanto foi cadastrado e quanto já foi atendido.
// "Atendida" = área concluída (todos os dispositivos testados), que é a mesma
// régua da coluna Situação — assim os dois números nunca se contradizem.
export interface ResumoAreaFabrica {
  pct_cadastrado: number;   // soma de pct_area de todas as áreas
  pct_atendido: number;     // soma de pct_area das áreas concluídas
  areas_com_pct: number;    // quantas áreas têm pct_area preenchido
}

// Inclusive day count between two ISO dates (same day = 1 day of work).
// Returns null if either date is missing or the range is inverted.
export function diasEntre(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const a = Date.parse(inicio + "T00:00:00Z");
  const b = Date.parse(fim + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

// Sums the área percentages. Kept separate from montarCronograma so the PDF and
// the JSON route show exactly the same totals.
export function resumirAreaFabrica(areas: AreaCronograma[]): ResumoAreaFabrica {
  let cadastrado = 0, atendido = 0, comPct = 0;
  for (const a of areas) {
    if (a.pct_area === null) continue;
    comPct++;
    cadastrado += a.pct_area;
    if (a.situacao === "concluido") atendido += a.pct_area;
  }
  // 3 casas: os valores vêm em NUMERIC(6,3) e somar floats acumula ruído.
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return { pct_cadastrado: r3(cadastrado), pct_atendido: r3(atendido), areas_com_pct: comPct };
}
