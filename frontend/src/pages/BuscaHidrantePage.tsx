import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Filter, Eye, Droplets, FileText, Download, Loader2,
  ChevronLeft, ChevronRight, AlertCircle, X,
} from "lucide-react";
import { hidrantesApi } from "../lib/api";
import type {
  FiltrosBuscaHidrante, PaginaBuscaHidrante, Hidrante,
  SituacaoHidrante, StatusInspecao, UnidadeHidranteProgresso,
} from "../lib/types";
import { toast } from "../components/Toast";

// ── situação metadata (checklist-derived, no expiry) ──────────────────────────
const SIT_META: Record<SituacaoHidrante, { label: string; badge: string }> = {
  atencao:       { label: "Atenção",       badge: "bg-red-100 text-red-800" },
  pendente:      { label: "Pendente",      badge: "bg-amber-100 text-amber-800" },
  ok:            { label: "OK",            badge: "bg-green-100 text-green-800" },
  indeterminado: { label: "Indeterminado", badge: "bg-gray-100 text-gray-500" },
};
const SIT_OPCOES: { value: SituacaoHidrante | ""; label: string }[] = [
  { value: "", label: "Todas as situações" },
  { value: "atencao", label: "Atenção (RUIM / Encaminhar)" },
  { value: "pendente", label: "Pendente" },
  { value: "ok", label: "OK" },
  { value: "indeterminado", label: "Indeterminado" },
];
const STATUS_OPCOES: { value: StatusInspecao | ""; label: string }[] = [
  { value: "", label: "Qualquer status" },
  { value: "nao_inspecionado", label: "Não inspecionado" },
  { value: "aguardando_verificacao", label: "Aguardando verificação" },
  { value: "verificado", label: "Verificado" },
];

const EMPTY: PaginaBuscaHidrante = {
  resultados: [], total: 0, pagina: 1, total_paginas: 1,
  contagens: { total: 0, atencao: 0, pendente: 0, ok: 0, indeterminado: 0 },
};

export function BuscaHidrantePage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();

  const [filtros, setFiltros] = useState<FiltrosBuscaHidrante>({});
  const [draft, setDraft]     = useState<FiltrosBuscaHidrante>({});
  const [showFilters, setShowFilters] = useState(true);

  const [pagina, setPagina]   = useState<PaginaBuscaHidrante>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Unit ficha (official format) — preview + PDF
  const [unidades, setUnidades]     = useState<UnidadeHidranteProgresso[]>([]);
  const [unidadeSel, setUnidadeSel] = useState("");
  const [baixando, setBaixando]     = useState(false);
  const [previewando, setPreviewando] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    hidrantesApi.listar()
      .then((r) => { setUnidades(r.unidades); if (r.unidades[0]) setUnidadeSel(r.unidades[0].nome); })
      .catch(() => {/* optional */});
  }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function previewUnidade() {
    if (!unidadeSel) return;
    setPreviewando(true);
    try {
      const url = await hidrantesApi.fichaPreview(unidadeSel);
      setPreviewUrl(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao gerar pré-visualização.", "erro");
    } finally {
      setPreviewando(false);
    }
  }
  async function baixarUnidade() {
    if (!unidadeSel) return;
    setBaixando(true);
    try {
      await hidrantesApi.baixarFicha(unidadeSel);
      toast("Ficha baixada.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao baixar ficha.", "erro");
    } finally {
      setBaixando(false);
    }
  }
  function fecharPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  const doSearch = useCallback(async (f: FiltrosBuscaHidrante, page = 1) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setHasSearched(true);
    try {
      const result = await hidrantesApi.buscar({ ...f, page });
      setPagina(result);
      setFiltros({ ...f, page });
    } catch (err: any) {
      if (err?.name !== "AbortError") toast(err?.message ?? "Erro ao buscar.", "erro");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); doSearch(draft, 1); };
  const handleClear  = () => { setDraft({}); doSearch({}, 1); };
  const handlePage   = (p: number) => doSearch(filtros, p);

  const draftAtivo = Object.values(draft).some((v) => v !== undefined && v !== "" && v !== null);
  const filtrosAtivos = Object.entries(filtros)
    .filter(([k, v]) => k !== "page" && v !== undefined && v !== "" && v !== null).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          {!embedded && <h1 className="text-2xl font-bold text-gray-900">Busca e Relatórios — Hidrantes</h1>}
          <p className="text-sm text-gray-500 mt-0.5">
            Filtre hidrantes por unidade, setor, inspetor ou situação e emita a ficha oficial.
          </p>
        </div>
        <button onClick={() => setShowFilters((v) => !v)} className="btn btn-secondary flex items-center gap-2 text-sm">
          <Filter className="w-4 h-4" />
          {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
          {filtrosAtivos > 0 && (
            <span className="ml-1 bg-sky-600 text-white text-xs rounded-full px-1.5 py-0.5">{filtrosAtivos}</span>
          )}
        </button>
      </div>

      {/* Official unit ficha (formato oficial) */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Droplets className="w-4 h-4 text-sky-600" />
          <h2 className="text-sm font-semibold text-gray-900">Ficha por Unidade (formato oficial)</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Gera a Ficha de Inspeção Mensal dos Hidrantes (mesmo formato do modelo) com todos os hidrantes da unidade.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="label">Unidade</label>
            <select className="input" value={unidadeSel} onChange={(e) => setUnidadeSel(e.target.value)}>
              {unidades.length === 0 && <option value="">— nenhuma unidade —</option>}
              {unidades.map((u) => (
                <option key={u.nome} value={u.nome}>{u.nome} ({u.total_esperado})</option>
              ))}
            </select>
          </div>
          <button onClick={previewUnidade} disabled={!unidadeSel || previewando} className="btn-primary">
            {previewando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Pré-visualizar
          </button>
          <button onClick={baixarUnidade} disabled={!unidadeSel || baixando} className="btn-secondary">
            {baixando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Número */}
            <div>
              <label className="form-label">Número</label>
              <input type="text" className="input" placeholder="Ex.: H01"
                value={draft.numero ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, numero: e.target.value || undefined }))} />
            </div>
            {/* Unidade */}
            <div>
              <label className="form-label">Unidade</label>
              <select className="input"
                value={draft.unidade ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, unidade: e.target.value || undefined }))}>
                <option value="">Todas as unidades</option>
                {unidades.map((u) => (
                  <option key={u.nome} value={u.nome}>{u.nome} ({u.total_esperado})</option>
                ))}
              </select>
            </div>
            {/* Setor */}
            <div>
              <label className="form-label">Setor</label>
              <input type="text" className="input" placeholder="Ex.: Portaria"
                value={draft.setor ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, setor: e.target.value || undefined }))} />
            </div>
            {/* Inspetor */}
            <div>
              <label className="form-label">Inspetor</label>
              <input type="text" className="input" placeholder="Nome parcial"
                value={draft.inspetor ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, inspetor: e.target.value || undefined }))} />
            </div>
            {/* Situação */}
            <div>
              <label className="form-label">Situação</label>
              <select className="input"
                value={draft.situacao ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, situacao: (e.target.value as SituacaoHidrante) || undefined }))}>
                {SIT_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {/* Status de inspeção */}
            <div>
              <label className="form-label">Status de inspeção</label>
              <select className="input"
                value={draft.status_inspecao ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, status_inspecao: (e.target.value as StatusInspecao) || undefined }))}>
                {STATUS_OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button type="submit" disabled={loading} className="btn btn-primary flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
            {draftAtivo && (
              <button type="button" onClick={handleClear} className="btn btn-secondary flex items-center gap-2">
                <X className="w-4 h-4" /> Limpar filtros
              </button>
            )}
          </div>
        </form>
      )}

      {/* Results */}
      {hasSearched && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="font-semibold text-gray-700">{pagina.total} hidrante(s) encontrado(s)</span>
            {pagina.contagens.atencao > 0 && (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <AlertCircle className="w-4 h-4" /> {pagina.contagens.atencao} em atenção
              </span>
            )}
            {pagina.contagens.pendente > 0 && (
              <span className="text-amber-600 font-medium">{pagina.contagens.pendente} pendente(s)</span>
            )}
          </div>

          {pagina.total > 0 && (
            <div className="flex flex-wrap gap-2">
              {(["atencao", "pendente", "ok", "indeterminado"] as SituacaoHidrante[]).map((s) => {
                const count = pagina.contagens[s];
                if (!count) return null;
                return (
                  <span key={s} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${SIT_META[s].badge}`}>
                    {SIT_META[s].label}: {count}
                  </span>
                );
              })}
            </div>
          )}

          {loading ? (
            <div className="card p-12 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
          ) : pagina.resultados.length === 0 ? (
            <div className="card p-10 text-center text-gray-500 space-y-2">
              <Search className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="font-medium">Nenhum hidrante encontrado</p>
              <p className="text-sm">Tente ajustar os filtros.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Número</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Unidade / Setor</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Situação</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Status</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Inspetor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagina.resultados.map((h) => <Row key={h.id} h={h} navigate={navigate} />)}
                  </tbody>
                </table>
              </div>
              <div className="sm:hidden divide-y divide-gray-100">
                {pagina.resultados.map((h) => <MobileCard key={h.id} h={h} navigate={navigate} />)}
              </div>
            </div>
          )}

          {pagina.total_paginas > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Página {pagina.pagina} de {pagina.total_paginas}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => handlePage(pagina.pagina - 1)} disabled={pagina.pagina <= 1 || loading}
                  className="btn btn-secondary px-2 py-1.5" aria-label="Página anterior">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => handlePage(pagina.pagina + 1)} disabled={pagina.pagina >= pagina.total_paginas || loading}
                  className="btn btn-secondary px-2 py-1.5" aria-label="Próxima página">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!hasSearched && (
        <div className="card p-14 text-center text-gray-400 space-y-3">
          <Search className="w-12 h-12 text-gray-200 mx-auto" />
          <p className="font-medium text-gray-500">Configure os filtros e clique em Buscar</p>
          <p className="text-sm">Todos os filtros são opcionais — deixe em branco para listar tudo.</p>
        </div>
      )}

      {/* Unit ficha preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col p-3 sm:p-6 animate-fade-in" onClick={fecharPreview}>
          <div className="flex items-center justify-between mb-2 text-white">
            <p className="text-sm font-medium">Pré-visualização — {unidadeSel}</p>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={baixarUnidade} className="btn-secondary btn-sm">
                <Download className="w-3.5 h-3.5" /> Baixar PDF
              </button>
              <button onClick={fecharPreview} className="btn-secondary btn-sm">
                <X className="w-3.5 h-3.5" /> Fechar
              </button>
            </div>
          </div>
          <iframe title="Pré-visualização da ficha" src={previewUrl}
            className="flex-1 w-full rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function SitBadge({ s }: { s: SituacaoHidrante }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SIT_META[s].badge}`}>
      {SIT_META[s].label}
    </span>
  );
}

const STATUS_LABEL: Record<StatusInspecao, string> = {
  nao_inspecionado: "Não inspecionado",
  aguardando_verificacao: "Aguardando",
  verificado: "Verificado",
};

function Row({ h, navigate }: { h: Hidrante; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <tr
      className={`hover:bg-gray-50 cursor-pointer transition-colors ${
        h.situacao === "atencao" ? "bg-red-50/40" : h.situacao === "pendente" ? "bg-amber-50/30" : ""
      }`}
      onClick={() => navigate(`/hidrantes/${h.id}`)}
    >
      <td className="px-4 py-3 font-mono font-semibold text-gray-800">{h.numero}</td>
      <td className="px-4 py-3">
        <span className="font-medium text-gray-800">{h.unidade}</span>
        {h.setor && <span className="text-gray-400 text-xs block">{h.setor}</span>}
      </td>
      <td className="px-4 py-3"><SitBadge s={h.situacao} /></td>
      <td className="px-4 py-3 text-gray-600">{STATUS_LABEL[h.status_inspecao]}</td>
      <td className="px-4 py-3 text-gray-600">{h.inspetor ?? "—"}</td>
    </tr>
  );
}

function MobileCard({ h, navigate }: { h: Hidrante; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div
      className={`px-4 py-3 cursor-pointer hover:bg-gray-50 space-y-1 ${
        h.situacao === "atencao" ? "border-l-4 border-red-400" :
        h.situacao === "pendente" ? "border-l-4 border-amber-400" : ""
      }`}
      onClick={() => navigate(`/hidrantes/${h.id}`)}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono font-bold text-gray-800">{h.numero}</span>
        <SitBadge s={h.situacao} />
      </div>
      <p className="text-sm text-gray-600">{h.unidade}{h.setor ? ` — ${h.setor}` : ""}</p>
      <p className="text-xs text-gray-500">
        {STATUS_LABEL[h.status_inspecao]}{h.inspetor ? ` · ${h.inspetor}` : ""}
      </p>
    </div>
  );
}
