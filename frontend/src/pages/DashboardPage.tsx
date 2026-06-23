import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  Flame, Bell, Droplets, ArrowRight, AlertTriangle, Loader2,
  MapPin, Activity,
} from "lucide-react";
import { regioesApi, alarmeApi, hidrantesApi, type RelatorioProgresso } from "../lib/api";
import type { RegiaoProgresso, UnidadeHidranteProgresso } from "../lib/types";
import { GaugeDonut } from "../components/GaugeDonut";
import { SaudeCard } from "../components/SaudeCard";
import { toast } from "../components/Toast";

// Greeting by local hour.
function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function DashboardPage() {
  const { profile } = useAuth();

  const [regioes, setRegioes] = useState<RegiaoProgresso[] | null>(null);
  const [cicloMes, setCicloMes] = useState<string | null>(null);
  const [prog, setProg] = useState<RelatorioProgresso | null>(null);
  const [unidadesHid, setUnidadesHid] = useState<UnidadeHidranteProgresso[] | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.allSettled([regioesApi.listar(), alarmeApi.progresso(), hidrantesApi.listar()])
      .then(([r1, r2, r3]) => {
        if (r1.status === "fulfilled") { setRegioes(r1.value.regioes); setCicloMes(r1.value.ciclo?.mes_referencia ?? null); }
        else toast("Não foi possível carregar o progresso da Fase 1.", "erro");
        if (r2.status === "fulfilled") setProg(r2.value);
        else toast("Não foi possível carregar o progresso da Fase 2.", "erro");
        if (r3.status === "fulfilled") setUnidadesHid(r3.value.unidades);
      })
      .finally(() => setCarregando(false));
  }, []);

  // ── Phase 1 rollup ──
  const f1 = (() => {
    const rs = regioes ?? [];
    const totalEsperado = rs.reduce((s, r) => s + r.total_esperado, 0);
    const cadastrado = rs.reduce((s, r) => s + r.total_cadastrado, 0);
    const inspecionados = rs.reduce((s, r) => s + r.inspecionados, 0);
    const pctInsp = totalEsperado ? Math.round((inspecionados / totalEsperado) * 100) : 0;
    return { regioes: rs.length, totalEsperado, cadastrado, inspecionados, pctInsp };
  })();

  // ── Phase 2 rollup ──
  const f2 = (() => {
    if (!prog) return { total: 0, esperado: 534, pctInstalado: 0, faltam: 534 };
    return {
      total: prog.geral.total,
      esperado: prog.total_esperado,
      pctInstalado: prog.geral.pct_instalado,
      faltam: prog.reconciliacao.total_faltam,
    };
  })();

  // ── Phase 3 rollup ──
  const f3 = (() => {
    const us = unidadesHid ?? [];
    const totalEsperado = us.reduce((s, u) => s + u.total_esperado, 0);
    const cadastrado = us.reduce((s, u) => s + u.total_cadastrado, 0);
    const inspecionados = us.reduce((s, u) => s + u.inspecionados, 0);
    const pctInsp = totalEsperado ? Math.round((inspecionados / totalEsperado) * 100) : 0;
    return { unidades: us.length, totalEsperado, cadastrado, inspecionados, pctInsp };
  })();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">{saudacao()}, {profile?.nome?.split(" ")[0] ?? ""}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Visão geral do andamento das fases do projeto.
        </p>
      </div>

      {carregando ? (
        <div className="card p-12 text-center text-gray-400"><Loader2 className="w-8 h-8 mx-auto animate-spin" /></div>
      ) : (
        <>
          {/* Phase cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <FaseCard
              numero={1}
              titulo="Extintores"
              Icon={Flame}
              cor="#ea580c"
              corBg="bg-orange-50 text-orange-600"
              to="/extintores"
              pct={f1.pctInsp}
              linhaPrincipal={`${f1.cadastrado} de ${f1.totalEsperado} cadastrados`}
              linhaSecundaria={`${f1.inspecionados} inspecionados${cicloMes ? ` · ${cicloMes}` : ""} · ${f1.regioes} regiões`}
              legendaGauge="inspecionado"
            />
            <FaseCard
              numero={2}
              titulo="Alarme de incêndio"
              Icon={Bell}
              cor="#dc2626"
              corBg="bg-brand-50 text-brand-600"
              to="/alarme"
              pct={f2.pctInstalado}
              linhaPrincipal={`${f2.total} de ${f2.esperado} dispositivos`}
              linhaSecundaria={f2.faltam > 0 ? `${f2.faltam} pontos pendentes no projeto` : "Inventário completo"}
              legendaGauge="instalado"
            />
            <FaseCard
              numero={3}
              titulo="Hidrantes"
              Icon={Droplets}
              cor="#0284c7"
              corBg="bg-sky-50 text-sky-600"
              to="/hidrantes"
              pct={f3.pctInsp}
              linhaPrincipal={`${f3.cadastrado} de ${f3.totalEsperado} cadastrados`}
              linhaSecundaria={f3.unidades > 0 ? `${f3.inspecionados} inspecionados · ${f3.unidades} unidade(s)` : "Cadastre as unidades em Hidrantes"}
              legendaGauge="inspecionado"
            />
          </div>

          {/* Detail row: Phase 1 per-region + Phase 2 BOM gaps */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RegioesProgresso regioes={regioes ?? []} />
            <BomGaps prog={prog} />
          </div>

          {/* Phase 3 per-unit hydrant progress */}
          <UnidadesHidranteProgresso unidades={unidadesHid ?? []} />

          {/* System health — owner only (OpenAI / Z-API status) */}
          {profile?.role === "owner" && <SaudeCard />}
        </>
      )}
    </div>
  );
}

// ── Phase summary card with gauge ──────────────────────────────────────────────
function FaseCard({
  numero, titulo, Icon, cor, corBg, to, pct, linhaPrincipal, linhaSecundaria, legendaGauge,
}: {
  numero: number; titulo: string; Icon: React.ElementType; cor: string; corBg: string;
  to: string; pct: number; linhaPrincipal: string; linhaSecundaria: string; legendaGauge: string;
}) {
  return (
    <Link to={to} className="card-hover p-5 flex items-center gap-4 group">
      <GaugeDonut pct={pct} cor={cor} legenda={legendaGauge} tamanho={104} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 rounded-lg ${corBg} flex items-center justify-center shrink-0`}>
            <Icon className="w-4 h-4" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Fase {numero}</p>
        </div>
        <p className="font-bold text-gray-900 mt-1.5">{titulo}</p>
        <p className="text-sm text-gray-700 mt-0.5">{linhaPrincipal}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{linhaSecundaria}</p>
        <span className="inline-flex items-center gap-1 text-xs font-medium mt-2 group-hover:gap-2 transition-all" style={{ color: cor }}>
          Abrir <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  );
}

// ── Phase 1: per-region inspection bars ────────────────────────────────────────
function RegioesProgresso({ regioes }: { regioes: RegiaoProgresso[] }) {
  const ordenadas = [...regioes].sort((a, b) => b.pct_inspecionado - a.pct_inspecionado);
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center"><MapPin className="w-4 h-4" /></span>
        <h2 className="text-sm font-bold text-gray-900">Fase 1 · Progresso por região</h2>
        <Link to="/extintores" className="ml-auto text-xs text-brand-600 hover:underline">Ver tudo</Link>
      </div>
      {ordenadas.length === 0 ? (
        <p className="text-sm text-gray-500">Sem regiões cadastradas.</p>
      ) : (
        <div className="space-y-2.5">
          {ordenadas.map((r) => (
            <div key={r.nome} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-32 shrink-0 truncate" title={r.nome}>{r.nome}</span>
              <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-orange-500" style={{ width: `${Math.min(100, r.pct_inspecionado)}%` }} />
              </div>
              <span className="text-xs text-gray-700 w-24 text-right shrink-0">
                {r.inspecionados}/{r.total_esperado} · {r.pct_inspecionado}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Phase 3: per-unit hydrant inspection bars ──────────────────────────────────
function UnidadesHidranteProgresso({ unidades }: { unidades: UnidadeHidranteProgresso[] }) {
  const ordenadas = [...unidades].sort((a, b) => b.pct_inspecionado - a.pct_inspecionado);
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center"><Droplets className="w-4 h-4" /></span>
        <h2 className="text-sm font-bold text-gray-900">Fase 3 · Progresso por unidade</h2>
        <Link to="/hidrantes" className="ml-auto text-xs text-brand-600 hover:underline">Ver tudo</Link>
      </div>
      {ordenadas.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma unidade cadastrada. Cadastre as unidades em Hidrantes.</p>
      ) : (
        <div className="space-y-2.5">
          {ordenadas.map((u) => (
            <div key={u.nome} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-32 shrink-0 truncate" title={u.nome}>{u.nome}</span>
              {/* verified (green) + awaiting (amber) on the same track */}
              <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden flex">
                <div className="h-full bg-green-500" style={{ width: `${Math.min(100, u.pct_verificado)}%` }} />
                <div className="h-full bg-amber-400" style={{ width: `${Math.max(0, Math.min(100, u.pct_inspecionado) - Math.min(100, u.pct_verificado))}%` }} />
              </div>
              <span className="text-xs text-gray-700 w-24 text-right shrink-0">
                {u.inspecionados}/{u.total_esperado} · {u.pct_inspecionado}%
              </span>
            </div>
          ))}
          <p className="text-[11px] text-gray-400 flex items-center gap-3 pt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> verificados</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> aguardando</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Phase 2: BOM gaps ──────────────────────────────────────────────────────────
function BomGaps({ prog }: { prog: RelatorioProgresso | null }) {
  const linhas = (prog?.reconciliacao.linhas ?? []).filter((l) => l.esperado > 0);
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><Activity className="w-4 h-4" /></span>
        <h2 className="text-sm font-bold text-gray-900">Fase 2 · Lacunas do projeto</h2>
        <Link to="/alarme" className="ml-auto text-xs text-brand-600 hover:underline">Ver tudo</Link>
      </div>
      {linhas.length === 0 ? (
        <p className="text-sm text-gray-500">Sem dados de dispositivos.</p>
      ) : (
        <div className="space-y-2.5">
          {linhas.map((l) => {
            const pct = l.esperado > 0 ? Math.round((l.cadastrados / l.esperado) * 100) : 0;
            return (
              <div key={l.tipo} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-36 shrink-0 truncate" title={l.label}>{l.label}</span>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${l.faltam > 0 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <span className="text-xs text-gray-700 w-24 text-right shrink-0">
                  {l.cadastrados}/{l.esperado}
                  {l.faltam > 0 && <span className="text-amber-700"> · −{l.faltam}</span>}
                </span>
              </div>
            );
          })}
          {prog && prog.reconciliacao.total_faltam > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2 mt-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {prog.reconciliacao.total_faltam} dispositivos ainda não cadastrados — mapeamento em andamento.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
