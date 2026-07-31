// Shared builder for the alarm execution schedule (cronograma por área).
// One row per (central + setor): the target delivery date + live install
// progress computed from the devices. Used by both the JSON route and the PDF.

import { supabaseAdmin } from "../db-admin";

// Tipos e cálculos puros vivem em cronogramaCalculo.ts (sem dependência do
// Supabase, para serem testáveis e reutilizáveis pelo PDF). Reexportados aqui
// para não quebrar quem já importa de "alarme/cronograma".
export type { AreaCronograma, SituacaoCronograma, ResumoAreaFabrica } from "./cronogramaCalculo";
export { diasEntre, resumirAreaFabrica } from "./cronogramaCalculo";

import type { AreaCronograma, SituacaoCronograma } from "./cronogramaCalculo";
import { diasEntre } from "./cronogramaCalculo";


export async function montarCronograma(): Promise<AreaCronograma[]> {
  const { data: disp, error } = await supabaseAdmin
    .from("dispositivos_alarme")
    .select("central_id, setor, status_instalacao, centrais!inner(numero, nome)")
    .eq("ativo", true);
  if (error) throw new Error(error.message);

  const { data: datas } = await supabaseAdmin
    .from("cronograma_alarme").select(
      "central_id, setor, data_prevista, observacoes, sistema_antigo, pct_area, " +
      "data_inicio_prevista, data_entrega_prevista, data_inicio_real, data_fim_real");

  interface InfoArea {
    data_prevista: string | null; observacoes: string | null; sistema_antigo: boolean | null;
    pct_area: number | null;
    data_inicio_prevista: string | null; data_entrega_prevista: string | null;
    data_inicio_real: string | null; data_fim_real: string | null;
  }
  const VAZIO: InfoArea = {
    data_prevista: null, observacoes: null, sistema_antigo: null, pct_area: null,
    data_inicio_prevista: null, data_entrega_prevista: null,
    data_inicio_real: null, data_fim_real: null,
  };

  const dataDe = new Map<string, InfoArea>();
  for (const r of (datas ?? []) as any[]) {
    dataDe.set(`${r.central_id}|${r.setor}`, {
      data_prevista: r.data_prevista ?? null,
      observacoes: r.observacoes ?? null,
      sistema_antigo: r.sistema_antigo ?? null,
      // NUMERIC chega como string no supabase-js; convertemos aqui.
      pct_area: r.pct_area === null || r.pct_area === undefined ? null : Number(r.pct_area),
      data_inicio_prevista:  r.data_inicio_prevista  ?? null,
      data_entrega_prevista: r.data_entrega_prevista ?? null,
      data_inicio_real:      r.data_inicio_real      ?? null,
      data_fim_real:         r.data_fim_real         ?? null,
    });
  }

  type Grupo = {
    central_id: string; central_numero: number | null; central_nome: string | null;
    setor: string; total: number; pendente: number; instalado: number; enderecado: number; testado: number;
  };
  const grupos = new Map<string, Grupo>();
  for (const d of (disp ?? []) as any[]) {
    const setor = d.setor ?? "";
    const key = `${d.central_id}|${setor}`;
    const g = grupos.get(key) ?? {
      central_id: d.central_id,
      central_numero: d.centrais?.numero ?? null,
      central_nome: d.centrais?.nome ?? null,
      setor, total: 0, pendente: 0, instalado: 0, enderecado: 0, testado: 0,
    };
    g.total++;
    const s = (d.status_instalacao ?? "pendente") as "pendente" | "instalado" | "enderecado" | "testado";
    g[s]++;
    grupos.set(key, g);
  }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const areas: AreaCronograma[] = Array.from(grupos.values()).map((g) => {
    const concluidos = g.testado;
    const pct = g.total > 0 ? Math.round((concluidos / g.total) * 100) : 0;
    const faltam = g.total - concluidos;
    const info = dataDe.get(`${g.central_id}|${g.setor}`) ?? VAZIO;
    // A entrega prevista nova tem precedência; sem ela, cai na data_prevista
    // original (é a mesma data, só que na coluna antiga).
    const entregaPrevista = info.data_entrega_prevista ?? info.data_prevista;
    let situacao: SituacaoCronograma;
    if (faltam === 0) situacao = "concluido";
    else if (!entregaPrevista) situacao = "sem_data";
    else {
      const alvo = new Date(entregaPrevista + "T00:00:00");
      situacao = alvo < hoje ? "atrasado" : "no_prazo";
    }
    return {
      central_id: g.central_id, central_numero: g.central_numero, central_nome: g.central_nome,
      setor: g.setor, total: g.total,
      pendente: g.pendente, instalado: g.instalado, enderecado: g.enderecado, testado: g.testado,
      concluidos, faltam, pct,
      data_prevista: info.data_prevista, observacoes: info.observacoes,
      sistema_antigo: info.sistema_antigo,
      pct_area: info.pct_area,
      data_inicio_prevista:  info.data_inicio_prevista,
      data_entrega_prevista: entregaPrevista,
      data_inicio_real:      info.data_inicio_real,
      data_fim_real:         info.data_fim_real,
      duracao_prevista_dias: diasEntre(info.data_inicio_prevista, entregaPrevista),
      duracao_real_dias:     diasEntre(info.data_inicio_real, info.data_fim_real),
      situacao,
    };
  });

  areas.sort((a, b) =>
    (a.central_numero ?? 99) - (b.central_numero ?? 99) ||
    (a.data_entrega_prevista ?? "9999").localeCompare(b.data_entrega_prevista ?? "9999") ||
    a.setor.localeCompare(b.setor, "pt-BR"));

  return areas;
}
