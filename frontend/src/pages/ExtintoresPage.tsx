import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { extintoresApi } from "../lib/api";
import type { Extintor, Situacao } from "../lib/types";
import { formatarData } from "../lib/formatters";
import {
  Flame, Search, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, XCircle, HelpCircle, ChevronRight, MapPin, Filter,
} from "lucide-react";

// ── Situacao helpers ──────────────────────────────────────────────────────────

interface SituacaoMeta {
  label: string;
  badgeClass: string;
  rowClass: string;     // row/card tint
  borderClass: string;  // left accent
  Icon: React.ElementType;
}

const SITUACAO_META: Record<Situacao, SituacaoMeta> = {
  vencido:       { label: "Vencido",         badgeClass: "badge-red",   rowClass: "bg-red-50/60",    borderClass: "border-l-4 border-l-red-500",    Icon: XCircle },
  descartado:    { label: "Descartado",       badgeClass: "badge-red",   rowClass: "bg-red-50/40",    borderClass: "border-l-4 border-l-red-400",    Icon: XCircle },
  proximo:       { label: "Próx. vencimento", badgeClass: "badge-amber", rowClass: "bg-amber-50/50",  borderClass: "border-l-4 border-l-amber-400",  Icon: Clock },
  em_dia:        { label: "Em dia",           badgeClass: "badge-green", rowClass: "",                borderClass: "",                               Icon: CheckCircle2 },
  indeterminado: { label: "Indeterminado",    badgeClass: "badge-gray",  rowClass: "bg-gray-50",      borderClass: "border-l-4 border-l-gray-300",   Icon: HelpCircle },
};

function SituacaoBadge({ situacao }: { situacao: Situacao | undefined }) {
  if (!situacao) return null;
  const meta = SITUACAO_META[situacao];
  return (
    <span className={meta.badgeClass}>
      <meta.Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────

const FILTROS_SITUACAO: { value: Situacao | "todos"; label: string }[] = [
  { value: "todos",       label: "Todos" },
  { value: "vencido",     label: "Vencidos" },
  { value: "proximo",     label: "Próximos" },
  { value: "descartado",  label: "Descartados" },
  { value: "em_dia",      label: "Em dia" },
  { value: "indeterminado", label: "Indeterminado" },
];

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="card p-4 flex items-center gap-4">
          <div className="skeleton h-4 w-8 shrink-0" />
          <div className="skeleton h-4 w-28" />
          <div className="skeleton h-4 w-24 hidden sm:block" />
          <div className="skeleton h-5 w-16 rounded-full ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ExtintoresPage() {
  const navigate = useNavigate();

  const [extintores, setExtintores]   = useState<Extintor[]>([]);
  const [carregando, setCarregando]   = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [erro, setErro]               = useState("");

  const [filtroSituacao, setFiltroSituacao] = useState<Situacao | "todos">("todos");
  const [filtroUnidade, setFiltroUnidade]   = useState("");
  const [busca, setBusca]                   = useState("");

  const carregar = useCallback(async (silencioso = false) => {
    if (silencioso) setRecarregando(true);
    else { setCarregando(true); setErro(""); }
    try {
      const { extintores: lista } = await extintoresApi.listar();
      setExtintores(Array.isArray(lista) ? lista : []);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar extintores.");
    } finally {
      setCarregando(false);
      setRecarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // Counts per situacao (before text/unidade filter — for chip labels)
  const contagens = extintores.reduce<Record<string, number>>((acc, e) => {
    const s = e.situacao ?? "indeterminado";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  // Unique unidades for dropdown
  const unidades = [...new Set(extintores.map((e) => e.unidade))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  // Apply all filters
  const visivel = extintores.filter((e) => {
    if (filtroSituacao !== "todos" && e.situacao !== filtroSituacao) return false;
    if (filtroUnidade && e.unidade !== filtroUnidade) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (
        !e.numero.toLowerCase().includes(q) &&
        !e.setor.toLowerCase().includes(q) &&
        !e.unidade.toLowerCase().includes(q) &&
        !e.tipo_carga.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const alertas = (contagens["vencido"] ?? 0) + (contagens["descartado"] ?? 0);

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Extintores</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {!carregando && `${extintores.length} extintor${extintores.length !== 1 ? "es" : ""} registrado${extintores.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => carregar(true)}
          disabled={recarregando}
          className="btn-secondary sm:w-auto w-full"
        >
          <RefreshCw className={`w-4 h-4 ${recarregando ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Alert banner */}
      {!carregando && alertas > 0 && (
        <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">
            <strong>{alertas} extintor{alertas !== 1 ? "es" : ""}</strong> com situação crítica
            {(contagens["vencido"] ?? 0) > 0 && ` — ${contagens["vencido"]} vencido${(contagens["vencido"] ?? 0) !== 1 ? "s" : ""}`}
            {(contagens["descartado"] ?? 0) > 0 && ` — ${contagens["descartado"]} descartado${(contagens["descartado"] ?? 0) !== 1 ? "s" : ""}`}.
            Providencie manutenção imediatamente.
          </p>
        </div>
      )}

      {/* Info banner when empty */}
      {!carregando && extintores.length === 0 && !erro && (
        <div className="card p-16 text-center border-dashed">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Flame className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-500">Nenhum extintor registrado ainda.</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
            Os extintores aparecem aqui automaticamente após os inspetores enviarem fotos via WhatsApp.
          </p>
        </div>
      )}

      {/* Error */}
      {erro && (
        <div className="flex items-center gap-2.5 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      {carregando && <Skeleton />}

      {!carregando && extintores.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Text search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                className="input pl-9"
                placeholder="Buscar nº, setor, tipo…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            {/* Unidade filter */}
            {unidades.length > 1 && (
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <select
                  className="input pl-9 pr-8 appearance-none"
                  value={filtroUnidade}
                  onChange={(e) => setFiltroUnidade(e.target.value)}
                >
                  <option value="">Todas as unidades</option>
                  {unidades.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Situacao chips */}
          <div className="flex flex-wrap gap-2">
            {FILTROS_SITUACAO.map(({ value, label }) => {
              const count = value === "todos" ? extintores.length : (contagens[value] ?? 0);
              if (count === 0 && value !== "todos") return null;
              const active = filtroSituacao === value;
              return (
                <button
                  key={value}
                  onClick={() => setFiltroSituacao(value)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all duration-150 ${
                    active
                      ? value === "todos"
                        ? "bg-gray-900 text-white border-gray-900"
                        : value === "vencido" || value === "descartado"
                        ? "bg-red-600 text-white border-red-600"
                        : value === "proximo"
                        ? "bg-amber-500 text-white border-amber-500"
                        : value === "em_dia"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-gray-600 text-white border-gray-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* No results after filter */}
          {visivel.length === 0 && (
            <div className="card p-10 text-center">
              <Filter className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nenhum extintor encontrado para os filtros aplicados.</p>
            </div>
          )}

          {/* Desktop table */}
          {visivel.length > 0 && (
            <>
              <div className="card overflow-hidden hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-th">Nº</th>
                        <th className="table-th">Unidade</th>
                        <th className="table-th">Setor</th>
                        <th className="table-th">Tipo / Carga</th>
                        <th className="table-th">Venc. carga</th>
                        <th className="table-th">Venc. teste</th>
                        <th className="table-th">Última inspeção</th>
                        <th className="table-th">Situação</th>
                        <th className="table-th w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visivel.map((e) => {
                        const sit = e.situacao ?? "indeterminado";
                        const meta = SITUACAO_META[sit];
                        const critico = sit === "vencido" || sit === "descartado";
                        return (
                          <tr
                            key={e.id}
                            onClick={() => navigate(`/extintores/${e.id}`)}
                            className={`table-row cursor-pointer ${meta.rowClass} ${meta.borderClass}`}
                          >
                            <td className={`table-td font-bold ${critico ? "text-red-700" : "text-gray-900"}`}>
                              {e.numero}
                            </td>
                            <td className="table-td text-gray-600">{e.unidade}</td>
                            <td className="table-td text-gray-500">{e.setor || "—"}</td>
                            <td className="table-td">
                              <span className="badge-blue">{e.tipo_carga}</span>
                            </td>
                            <td className="table-td">
                              <VencimentoCell valor={e.vencimento_carga} />
                            </td>
                            <td className="table-td">
                              <VencimentoCell valor={e.vencimento_teste} />
                            </td>
                            <td className="table-td">
                              {e.ultima_inspecao ? (
                                <span className="text-gray-500">
                                  {formatarData(e.ultima_inspecao.data_inspecao)}
                                  {e.ultima_inspecao.tem_irregularidade && (
                                    <span className="ml-1.5 badge-red text-[10px]">⚠ Irregular</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-gray-300">Sem inspeção</span>
                              )}
                            </td>
                            <td className="table-td">
                              <SituacaoBadge situacao={sit} />
                            </td>
                            <td className="table-td">
                              <ChevronRight className="w-4 h-4 text-gray-300" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-400">
                  {visivel.length} extintor{visivel.length !== 1 ? "es" : ""}
                  {visivel.length < extintores.length && ` (de ${extintores.length} total)`}
                </div>
              </div>

              {/* Mobile cards */}
              <div className="space-y-2 md:hidden">
                {visivel.map((e) => {
                  const sit = e.situacao ?? "indeterminado";
                  const meta = SITUACAO_META[sit];
                  const critico = sit === "vencido" || sit === "descartado";
                  return (
                    <button
                      key={e.id}
                      onClick={() => navigate(`/extintores/${e.id}`)}
                      className={`w-full text-left card p-4 flex items-start gap-3 ${meta.rowClass} ${meta.borderClass} active:scale-[0.99] transition-transform`}
                    >
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-bold ${critico ? "text-red-700" : "text-gray-900"}`}>
                            Extintor {e.numero}
                          </span>
                          <SituacaoBadge situacao={sit} />
                          {e.cadastro_pendente && <span className="badge-amber text-[10px]">Pendente</span>}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                          <span>{e.unidade}</span>
                          {e.setor && <span>· {e.setor}</span>}
                          <span>· {e.tipo_carga}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                          {e.vencimento_carga && (
                            <span className="text-gray-400">
                              Carga: <VencimentoCell valor={e.vencimento_carga} />
                            </span>
                          )}
                          {e.vencimento_teste && (
                            <span className="text-gray-400">
                              Teste: <VencimentoCell valor={e.vencimento_teste} />
                            </span>
                          )}
                        </div>
                        {e.ultima_inspecao && (
                          <p className="text-xs text-gray-400">
                            Insp. {formatarData(e.ultima_inspecao.data_inspecao)} · {e.ultima_inspecao.inspetor}
                            {e.ultima_inspecao.tem_irregularidade && (
                              <span className="ml-1 text-red-600 font-semibold">⚠ Irregular</span>
                            )}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// Inline vencimento display with color cue
function VencimentoCell({ valor }: { valor: string | null | undefined }) {
  if (!valor) return <span className="text-gray-300">—</span>;
  const now = new Date();
  const parts = valor.match(/(\d{2,4})/g);
  const year = parts ? parseInt(parts[parts.length - 1]) : 9999;
  const fullYear = year < 100 ? 2000 + year : year;
  if (fullYear < now.getFullYear()) return <span className="badge-red">{valor}</span>;
  if (fullYear === now.getFullYear()) return <span className="badge-amber">{valor}</span>;
  return <span className="text-gray-600 text-sm">{valor}</span>;
}
