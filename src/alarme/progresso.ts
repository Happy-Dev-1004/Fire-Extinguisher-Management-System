// Install-progress aggregation for the alarm system.
//
// Computes, from the registered devices, how many are pendente / instalado /
// enderecado / testado — overall, per central, and per loop (laço) — plus the
// BOM-reconciliation gaps. PURE aggregation over rows passed in, so it's
// trivially unit-testable and null-safe: devices with no laço fall into a
// "sem laço" bucket and never break the math.

import { reconciliar, type Reconciliacao } from "./reconciliacao";

export const STATUS_INSTALACAO = ["pendente", "instalado", "enderecado", "testado"] as const;
export type StatusInstalacao = (typeof STATUS_INSTALACAO)[number];

export const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  instalado: "Instalado",
  enderecado: "Endereçado",
  testado: "Testado",
};

export interface DispositivoProgresso {
  central_numero: number | null;
  central_nome?: string | null;
  laco: number | null;
  tipo_dispositivo: string;
  status_instalacao: string | null;
}

export interface ContagemStatus {
  pendente: number;
  instalado: number;
  enderecado: number;
  testado: number;
  total: number;
  // % considered "done" — here, anything beyond pendente (instalado+).
  pct_instalado: number; // instalado+enderecado+testado over total
  pct_testado: number;   // testado over total (fully complete)
}

export interface GrupoLaco {
  laco: number | null;     // null = "sem laço definido"
  contagem: ContagemStatus;
}

export interface GrupoCentral {
  central_numero: number | null;
  central_nome: string | null;
  contagem: ContagemStatus;
  lacos: GrupoLaco[];
}

export interface RelatorioProgresso {
  geral: ContagemStatus;
  centrais: GrupoCentral[];
  reconciliacao: Reconciliacao;
  // Expected universe size from the BOM (the "513 points" target), so the UI can
  // show progress against the full scope even before all devices are registered.
  total_esperado: number;
}

function novaContagem(): ContagemStatus {
  return { pendente: 0, instalado: 0, enderecado: 0, testado: 0, total: 0, pct_instalado: 0, pct_testado: 0 };
}

function acumular(c: ContagemStatus, status: string | null): void {
  // Unknown/legacy status defaults to "pendente" so nothing is dropped.
  const s = (STATUS_INSTALACAO as readonly string[]).includes(status ?? "")
    ? (status as StatusInstalacao)
    : "pendente";
  c[s] += 1;
  c.total += 1;
}

function finalizar(c: ContagemStatus): void {
  const instaladoOuMais = c.instalado + c.enderecado + c.testado;
  c.pct_instalado = c.total > 0 ? Math.round((instaladoOuMais / c.total) * 100) : 0;
  c.pct_testado = c.total > 0 ? Math.round((c.testado / c.total) * 100) : 0;
}

export function agregarProgresso(
  dispositivos: DispositivoProgresso[],
  contagensPorTipo: Record<string, number>
): RelatorioProgresso {
  const geral = novaContagem();

  // central_numero (null-safe via the key "sem") → { nome, contagem, lacos map }
  const centraisMap = new Map<
    string,
    { numero: number | null; nome: string | null; contagem: ContagemStatus; lacos: Map<string, GrupoLaco> }
  >();

  for (const d of dispositivos) {
    acumular(geral, d.status_instalacao);

    const ckey = d.central_numero == null ? "sem" : String(d.central_numero);
    let central = centraisMap.get(ckey);
    if (!central) {
      central = {
        numero: d.central_numero ?? null,
        nome: d.central_nome ?? null,
        contagem: novaContagem(),
        lacos: new Map(),
      };
      centraisMap.set(ckey, central);
    }
    if (!central.nome && d.central_nome) central.nome = d.central_nome;
    acumular(central.contagem, d.status_instalacao);

    const lkey = d.laco == null ? "sem" : String(d.laco);
    let laco = central.lacos.get(lkey);
    if (!laco) {
      laco = { laco: d.laco ?? null, contagem: novaContagem() };
      central.lacos.set(lkey, laco);
    }
    acumular(laco.contagem, d.status_instalacao);
  }

  finalizar(geral);
  const centrais: GrupoCentral[] = [...centraisMap.values()]
    .map((c) => {
      finalizar(c.contagem);
      const lacos = [...c.lacos.values()];
      lacos.forEach((l) => finalizar(l.contagem));
      // loops ascending, nulls (sem laço) last
      lacos.sort((a, b) => {
        if (a.laco == null) return 1;
        if (b.laco == null) return -1;
        return a.laco - b.laco;
      });
      return {
        central_numero: c.numero,
        central_nome: c.nome,
        contagem: c.contagem,
        lacos,
      };
    })
    .sort((a, b) => {
      if (a.central_numero == null) return 1;
      if (b.central_numero == null) return -1;
      return a.central_numero - b.central_numero;
    });

  const reconciliacao = reconciliar(contagensPorTipo);

  return {
    geral,
    centrais,
    reconciliacao,
    total_esperado: reconciliacao.total_esperado,
  };
}
