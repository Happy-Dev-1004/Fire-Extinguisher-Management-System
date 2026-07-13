import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  alarmeApi,
  type RelatorioProgresso, type ContagemStatus, type GrupoCentral,
} from "../lib/api";
import { toast } from "../components/Toast";
import {
  Activity, AlertTriangle, Loader2,
  ChevronDown, ChevronRight, Wrench,
} from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string; bar: string }> = {
  pendente:   { label: "Pendente",   color: "text-gray-600",   bar: "bg-gray-400" },
  instalado:  { label: "Instalado",  color: "text-blue-700",   bar: "bg-blue-500" },
  enderecado: { label: "Endereçado", color: "text-violet-700", bar: "bg-violet-500" },
  testado:    { label: "Testado",    color: "text-green-700",  bar: "bg-green-500" },
};
const STATUS_ORDER = ["pendente", "instalado", "enderecado", "testado"] as const;

// A stacked progress bar over the four statuses.
function BarraStatus({ c }: { c: ContagemStatus }) {
  const seg = (n: number) => (c.total > 0 ? (n / c.total) * 100 : 0);
  return (
    <div className="w-full">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {STATUS_ORDER.map((s) =>
          c[s] > 0 ? (
            <div key={s} className={STATUS_META[s].bar} style={{ width: `${seg(c[s])}%` }} title={`${STATUS_META[s].label}: ${c[s]}`} />
          ) : null
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {STATUS_ORDER.map((s) => (
          <span key={s} className={`inline-flex items-center gap-1 ${STATUS_META[s].color}`}>
            <span className={`inline-block w-2 h-2 rounded-full ${STATUS_META[s].bar}`} />
            {STATUS_META[s].label}: <strong>{c[s]}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// `embedded` hides the standalone page header when rendered inside the Fase 2
// hub (the hub already shows the title + tabs). The RDO timeline lives in its
// own tab now, so it's not rendered here.
export function AlarmeProgressoPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [prog, setProg] = useState<RelatorioProgresso | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    alarmeApi.progresso()
      .then(setProg)
      .catch((err) => toast(err instanceof Error ? err.message : "Erro ao carregar progresso.", "erro"))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <div className="space-y-6">
      {!embedded && (
        <header>
          <div className="flex items-center gap-2 text-brand-600">
            <Activity className="w-5 h-5" />
            <h1 className="text-xl font-bold text-gray-900">Progresso de instalação — Alarme</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Andamento por central e laço, lacunas do projeto e relatórios diários (RDO).
          </p>
        </header>
      )}

      {carregando ? (
        <div className="card p-10 text-center text-gray-400"><Loader2 className="w-8 h-8 mx-auto animate-spin" /></div>
      ) : prog ? (
        <>
          <ResumoGeral prog={prog} />
          <InstalacaoPorTipo prog={prog} />
          <CentraisProgresso centrais={prog.centrais} />
        </>
      ) : (
        <p className="text-sm text-gray-500">Sem dados de progresso.</p>
      )}
    </div>
  );
}

// ── Overall ───────────────────────────────────────────────────────────────────
function ResumoGeral({ prog }: { prog: RelatorioProgresso }) {
  const g = prog.geral;
  const cobertura = prog.total_esperado > 0 ? Math.round((g.total / prog.total_esperado) * 100) : 0;
  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Visão geral</h2>
          <p className="text-xs text-gray-500">
            {g.total} de {prog.total_esperado} pontos previstos cadastrados ({cobertura}%) ·
            {" "}{g.pct_instalado}% instalados · {g.pct_testado}% testados
          </p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold text-brand-600">{g.pct_instalado}%</span>
          <p className="text-xs text-gray-400">instalado ou além</p>
        </div>
      </div>
      <BarraStatus c={g} />
      {g.total < prog.total_esperado && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {prog.total_esperado - g.total} ponto(s) do projeto ainda não foram cadastrados — o mapeamento de
          endereços, módulos e isoladores segue em andamento. Eles aparecem como pendentes nas lacunas abaixo.
        </p>
      )}
    </div>
  );
}

// ── Installation progress per device type (the headline: how many INSTALLED) ──
function InstalacaoPorTipo({ prog }: { prog: RelatorioProgresso }) {
  const tipos = prog.por_tipo.filter((t) => t.contagem.total > 0);
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="w-4 h-4 text-brand-600" />
        <h2 className="text-sm font-bold text-gray-900">Instalação por tipo de dispositivo</h2>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Quantos de cada tipo já foram <strong>instalados</strong> (instalado / endereçado / testado) do total cadastrado.
      </p>
      {tipos.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum dispositivo cadastrado ainda.</p>
      ) : (
        <div className="space-y-2.5">
          {tipos.map((t) => {
            const c = t.contagem;
            const instalados = c.instalado + c.enderecado + c.testado;
            return (
              <div key={t.tipo} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-44 shrink-0 truncate" title={t.label}>{t.label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden flex">
                  <div className="bg-green-500 h-full" style={{ width: `${c.pct_testado}%` }} title={`Testado: ${c.testado}`} />
                  <div className="bg-blue-500 h-full" style={{ width: `${Math.max(0, c.pct_instalado - c.pct_testado)}%` }} title={`Instalado/Endereçado: ${c.instalado + c.enderecado}`} />
                </div>
                <span className="text-xs text-gray-700 w-28 text-right shrink-0">
                  {instalados}/{c.total} instalados
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Per central / per loop ──────────────────────────────────────────────────────
function CentraisProgresso({ centrais }: { centrais: GrupoCentral[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-gray-900">Por central e laço</h2>
      {centrais.length === 0 && <p className="text-sm text-gray-500">Nenhum dispositivo cadastrado ainda.</p>}
      {centrais.map((c) => <CentralCard key={c.central_numero ?? "sem"} c={c} />)}
    </div>
  );
}

function CentralCard({ c }: { c: GrupoCentral }) {
  const [aberto, setAberto] = useState(false);
  const titulo = c.central_numero != null
    ? `Central ${c.central_numero}${c.central_nome ? ` — ${c.central_nome}` : ""}`
    : "Sem central definida";
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setAberto((v) => !v)} className="shrink-0" title={aberto ? "Recolher laços" : "Ver laços"}>
          {aberto ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
        {/* Clicking the central opens its device list (like Fases 1/3). */}
        {c.central_numero != null ? (
          <Link to={`/alarme/central/${c.central_numero}`} className="flex-1 min-w-0 group">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">{titulo}</p>
            <p className="text-xs text-gray-400">{c.contagem.total} dispositivo(s) · ver dispositivos</p>
          </Link>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{titulo}</p>
            <p className="text-xs text-gray-400">{c.contagem.total} dispositivo(s)</p>
          </div>
        )}
        <div className="w-40 sm:w-64 shrink-0"><BarraStatus c={c.contagem} /></div>
        {c.central_numero != null && (
          <Link to={`/alarme/central/${c.central_numero}`} className="shrink-0 text-gray-300 hover:text-brand-600" title="Ver dispositivos">
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
      {aberto && (
        <div className="mt-4 pl-7 space-y-3 border-t border-gray-100 pt-3">
          {c.lacos.map((l) => (
            <div key={l.laco ?? "sem"} className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-xs font-medium text-gray-600 w-28 shrink-0">
                {l.laco != null ? `Laço ${l.laco}` : "Sem laço"}
                <span className="text-gray-400"> ({l.contagem.total})</span>
              </span>
              <div className="flex-1"><BarraStatus c={l.contagem} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

