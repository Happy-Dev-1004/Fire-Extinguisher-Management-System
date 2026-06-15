import { z } from "zod";
import type { Situacao } from "../extintores/situacao";
import { calcularSituacao } from "../extintores/situacao";
import { logger } from "../logger";

const log = logger.child({ modulo: "busca" });

export const PAGE_SIZE = 50;

// ── Query-param schema ────────────────────────────────────────────────────────

export const FiltrosSchema = z.object({
  unidade:          z.string().optional(),
  setor:            z.string().optional(),
  numero:           z.string().optional(),         // partial match
  tipo_carga:       z.string().optional(),
  situacao:         z.enum(["em_dia","proximo","vencido","descartado","indeterminado"]).optional(),
  status_geral:     z.string().optional(),          // "Conforme" | "Reprovado" | etc.
  tem_irregularidade: z.enum(["true","false"]).transform(v => v === "true").optional(),
  mes_referencia:   z.string().optional(),
  inspetor:         z.string().optional(),
  vence_em_dias:    z.coerce.number().int().min(1).max(3650).optional(),
  page:             z.coerce.number().int().min(1).default(1),
});

export type Filtros = z.infer<typeof FiltrosSchema>;

// ── Row shapes ────────────────────────────────────────────────────────────────

export interface InspecaoResumo {
  id: string;
  mes_referencia: string;
  data_inspecao: string;
  inspetor: string;
  status_geral: string | null;
  tem_irregularidade: boolean | null;
}

export interface ResultadoBusca {
  id: string;
  numero: string;
  unidade: string;
  setor: string;
  tipo_carga: string;
  capacidade: string | null;
  vencimento_carga: string | null;
  vencimento_teste: string | null;
  status_ativo: boolean;
  data_baixa: string | null;
  motivo_baixa: string | null;
  cadastro_pendente: boolean;
  created_at: string;
  situacao: Situacao;
  ultima_inspecao: InspecaoResumo | null;
}

export interface AggregateCounts {
  total: number;
  em_dia: number;
  proximo: number;
  vencido: number;
  descartado: number;
  indeterminado: number;
  com_irregularidade: number;
}

export interface PaginaBusca {
  resultados: ResultadoBusca[];
  total: number;
  pagina: number;
  total_paginas: number;
  contagens: AggregateCounts;
}

// ── Query executor ────────────────────────────────────────────────────────────

export async function executarBusca(filtros: Filtros): Promise<PaginaBusca> {
  const { supabase } = await import("../db");

  // 1. Fetch ALL extintores matching the DB-level filters (unidade, setor, numero, tipo_carga, status_ativo)
  //    We cannot filter by situacao or vence_em_dias at DB level (computed from text dates),
  //    so we over-fetch and filter in JS.  The table is bounded (one client, ~hundreds of rows).

  let q = supabase
    .from("extintores")
    .select("*")
    .order("unidade")
    .order("numero_int", { ascending: true, nullsFirst: false })
    .order("numero");

  if (filtros.unidade)    q = q.eq("unidade", filtros.unidade);
  if (filtros.setor)      q = q.ilike("setor", `%${filtros.setor}%`);
  if (filtros.numero)     q = q.ilike("numero", `%${filtros.numero}%`);
  if (filtros.tipo_carga) q = q.ilike("tipo_carga", `%${filtros.tipo_carga}%`);

  const { data: extintores, error: errExt } = await q;
  if (errExt) {
    log.error({ err: errExt.message }, "erro ao buscar extintores");
    throw new Error(`Erro ao buscar extintores: ${errExt.message}`);
  }

  if (!extintores || extintores.length === 0) {
    return emptyPage(filtros.page);
  }

  // 2. Fetch latest inspection per extinguisher (one batch query)
  const numeros  = [...new Set(extintores.map((e: any) => e.numero))];
  const unidades = [...new Set(extintores.map((e: any) => e.unidade))];

  let inspecoesQuery = supabase
    .from("inspecoes")
    .select("id, extintor_numero, extintor_unidade, mes_referencia, data_inspecao, inspetor, status_geral, tem_irregularidade")
    .in("extintor_numero", numeros)
    .in("extintor_unidade", unidades)
    .order("data_inspecao", { ascending: false });

  if (filtros.mes_referencia) inspecoesQuery = inspecoesQuery.eq("mes_referencia", filtros.mes_referencia);
  if (filtros.inspetor)       inspecoesQuery = inspecoesQuery.ilike("inspetor", `%${filtros.inspetor}%`);
  if (filtros.status_geral)   inspecoesQuery = inspecoesQuery.eq("status_geral", filtros.status_geral);
  if (filtros.tem_irregularidade !== undefined) {
    inspecoesQuery = inspecoesQuery.eq("tem_irregularidade", filtros.tem_irregularidade);
  }

  const { data: inspecoes, error: errInsp } = await inspecoesQuery;
  if (errInsp) {
    log.warn({ err: errInsp.message }, "erro ao buscar inspeções — prosseguindo sem filtro de inspeção");
  }

  // 3. Build latest-per-extinguisher map
  const latestMap = new Map<string, InspecaoResumo>();
  for (const i of (inspecoes ?? [])) {
    const key = `${i.extintor_numero}|${i.extintor_unidade}`;
    if (!latestMap.has(key)) latestMap.set(key, i);
  }

  // 4. Compose results + compute situacao in JS
  const agora = new Date();
  const limiteVence = filtros.vence_em_dias
    ? new Date(agora.getTime() + filtros.vence_em_dias * 86_400_000)
    : null;

  let rows: ResultadoBusca[] = extintores.map((e: any): ResultadoBusca => {
    const situacao = calcularSituacao(e) as Situacao;
    const latest = latestMap.get(`${e.numero}|${e.unidade}`) ?? null;
    return { ...e, situacao, ultima_inspecao: latest };
  });

  // 5. JS-level filters (computed fields)
  if (filtros.situacao) {
    rows = rows.filter(r => r.situacao === filtros.situacao);
  }

  if (limiteVence) {
    const { parsearVencimento } = await import("../extintores/situacao");
    rows = rows.filter(r => {
      const dc = parsearVencimento(r.vencimento_carga, `${r.numero}|${r.unidade}`);
      const dt = parsearVencimento(r.vencimento_teste, `${r.numero}|${r.unidade}`);
      return (dc && dc <= limiteVence! && dc >= agora) ||
             (dt && dt <= limiteVence! && dt >= agora);
    });
  }

  // If inspection filters were applied, keep only extintores that have a matching inspection
  if (filtros.mes_referencia || filtros.inspetor || filtros.status_geral || filtros.tem_irregularidade !== undefined) {
    const comInspecao = new Set(latestMap.keys());
    rows = rows.filter(r => comInspecao.has(`${r.numero}|${r.unidade}`));
  }

  // 6. Aggregate counts (over the full filtered set, before pagination)
  const contagens: AggregateCounts = {
    total: rows.length,
    em_dia: 0, proximo: 0, vencido: 0, descartado: 0, indeterminado: 0,
    com_irregularidade: 0,
  };
  for (const r of rows) {
    contagens[r.situacao]++;
    if (r.ultima_inspecao?.tem_irregularidade) contagens.com_irregularidade++;
  }

  // 7. Paginate
  const totalPaginas = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagina = Math.min(filtros.page, totalPaginas);
  const slice = rows.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  return {
    resultados: slice,
    total: rows.length,
    pagina,
    total_paginas: totalPaginas,
    contagens,
  };
}

function emptyPage(pagina: number): PaginaBusca {
  return {
    resultados: [],
    total: 0,
    pagina,
    total_paginas: 1,
    contagens: { total: 0, em_dia: 0, proximo: 0, vencido: 0, descartado: 0, indeterminado: 0, com_irregularidade: 0 },
  };
}
