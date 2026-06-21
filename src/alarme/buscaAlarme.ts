// Search engine for alarm devices — same filter→query→counts→paginate shape as
// the extinguisher busca (src/busca/filtros.ts), so the dashboard can reuse the
// identical "filter then export" UX for Phase 2.
//
// Example queries this serves:
//   "todos os dispositivos não testados da Central 3"
//   "sirenes pendentes do setor Torrefação"

import { z } from "zod";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { TIPO_LABEL } from "./expectedBom";
import { STATUS_LABEL, STATUS_INSTALACAO } from "./progresso";

const log = logger.child({ modulo: "alarme/busca" });

export const PAGE_SIZE = 50;

const TIPOS = [
  "detector_fumaca", "detector_temperatura", "detector_linear",
  "acionador", "sirene", "modulo_supervisao", "isolador", "outro",
] as const;

export const FiltrosAlarmeSchema = z.object({
  central_numero:    z.coerce.number().int().min(1).max(99).optional(),
  laco:              z.coerce.number().int().positive().optional(),
  tipo_dispositivo:  z.enum(TIPOS).optional(),
  setor:             z.string().optional(),
  status_instalacao: z.enum(STATUS_INSTALACAO).optional(),
  // "true" → only devices still missing endereco/laco (cadastro incompleto)
  cadastro_pendente: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  com_foto:          z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  page:              z.coerce.number().int().min(1).default(1),
});

export type FiltrosAlarme = z.infer<typeof FiltrosAlarmeSchema>;

export interface DispositivoBusca {
  id: string;
  central_numero: number | null;
  central_nome: string | null;
  laco: number | null;
  endereco: string | null;
  tipo_dispositivo: string;
  tipo_label: string;
  setor: string | null;
  status_instalacao: string | null;
  status_label: string;
  data_instalacao: string | null;
  cadastro_pendente: boolean;
  qtd_fotos: number;
}

export interface ContagensAlarme {
  total: number;
  pendente: number;
  instalado: number;
  enderecado: number;
  testado: number;
  cadastro_pendente: number;
}

export interface PaginaBuscaAlarme {
  resultados: DispositivoBusca[];
  total: number;
  pagina: number;
  total_paginas: number;
  contagens: ContagensAlarme;
}

function mapRow(d: any): DispositivoBusca {
  const status = d.status_instalacao ?? "pendente";
  return {
    id: d.id,
    central_numero: d.centrais?.numero ?? null,
    central_nome: d.centrais?.nome ?? null,
    laco: d.laco ?? null,
    endereco: d.endereco ?? null,
    tipo_dispositivo: d.tipo_dispositivo,
    tipo_label: TIPO_LABEL[d.tipo_dispositivo] ?? d.tipo_dispositivo,
    setor: d.setor ?? null,
    status_instalacao: status,
    status_label: STATUS_LABEL[status] ?? status,
    data_instalacao: d.data_instalacao ?? null,
    cadastro_pendente: !!d.cadastro_pendente,
    qtd_fotos: (d.fotos ?? []).length,
  };
}

// Runs the search. When `todas` is true, ignores pagination and returns every
// matching row (used by the report export).
export async function buscarDispositivos(
  filtros: FiltrosAlarme,
  opts: { todas?: boolean } = {}
): Promise<PaginaBuscaAlarme> {
  let centralId: string | undefined;
  if (filtros.central_numero) {
    const { data: c } = await supabaseAdmin
      .from("centrais").select("id").eq("numero", filtros.central_numero).maybeSingle();
    if (!c) {
      return { resultados: [], total: 0, pagina: 1, total_paginas: 0,
        contagens: { total: 0, pendente: 0, instalado: 0, enderecado: 0, testado: 0, cadastro_pendente: 0 } };
    }
    centralId = (c as any).id;
  }

  let q = supabaseAdmin
    .from("dispositivos_alarme")
    .select("id, laco, endereco, tipo_dispositivo, setor, status_instalacao, data_instalacao, cadastro_pendente, fotos, centrais!inner(numero, nome)")
    .eq("ativo", true);

  if (centralId)                          q = q.eq("central_id", centralId);
  if (filtros.laco != null)               q = q.eq("laco", filtros.laco);
  if (filtros.tipo_dispositivo)           q = q.eq("tipo_dispositivo", filtros.tipo_dispositivo);
  if (filtros.setor)                      q = q.ilike("setor", `%${filtros.setor}%`);
  if (filtros.status_instalacao)          q = q.eq("status_instalacao", filtros.status_instalacao);
  if (filtros.cadastro_pendente != null)  q = q.eq("cadastro_pendente", filtros.cadastro_pendente);

  const { data, error } = await q;
  if (error) {
    log.error({ err: error.message }, "erro na busca de dispositivos");
    throw new Error(error.message);
  }

  let linhas = (data ?? []).map(mapRow);
  // com_foto is a computed filter (fotos[] length), applied in JS.
  if (filtros.com_foto != null) {
    linhas = linhas.filter((l) => (filtros.com_foto ? l.qtd_fotos > 0 : l.qtd_fotos === 0));
  }

  // Stable, human-readable ordering: Central (C1→C4) → tipo → laço → setor →
  // endereço. central_numero/laco live on the joined table, where PostgREST
  // ordering is unreliable, so we sort here after mapping. Empty/null values
  // sort LAST in every key (a named/addressed device comes before a blank one).
  const cmpNum = (a: number | null, b: number | null) =>
    a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b;
  const cmpStr = (a: string | null, b: string | null) => {
    const x = a ?? "", y = b ?? "";
    if (!x && !y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return x.localeCompare(y, "pt-BR");
  };
  linhas.sort((a, b) =>
    cmpNum(a.central_numero, b.central_numero) ||
    a.tipo_label.localeCompare(b.tipo_label, "pt-BR") ||
    cmpNum(a.laco, b.laco) ||
    cmpStr(a.setor, b.setor) ||
    cmpStr(a.endereco, b.endereco)
  );

  const contagens: ContagensAlarme = {
    total: linhas.length,
    pendente: linhas.filter((l) => l.status_instalacao === "pendente").length,
    instalado: linhas.filter((l) => l.status_instalacao === "instalado").length,
    enderecado: linhas.filter((l) => l.status_instalacao === "enderecado").length,
    testado: linhas.filter((l) => l.status_instalacao === "testado").length,
    cadastro_pendente: linhas.filter((l) => l.cadastro_pendente).length,
  };

  const total = linhas.length;
  const total_paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pagina = opts.todas ? 1 : Math.min(filtros.page, total_paginas);
  const resultados = opts.todas ? linhas : linhas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  return { resultados, total, pagina, total_paginas, contagens };
}
