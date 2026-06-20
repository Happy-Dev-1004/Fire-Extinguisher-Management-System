import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Filter, Download, FileText, Table2, Eye, MapPin,
  ChevronLeft, ChevronRight, AlertCircle, X, Loader2,
} from "lucide-react";
import { buscaApi, relatorioApi, regioesApi } from "../lib/api";
import type { FiltrosBusca, PaginaBusca, ResultadoBusca, Situacao, RegiaoProgresso } from "../lib/types";
import { toast } from "../components/Toast";

// ── Situação metadata ─────────────────────────────────────────────────────────

const SITUACAO_META: Record<Situacao, { label: string; badgeClass: string }> = {
  em_dia:        { label: "Em dia",            badgeClass: "bg-green-100 text-green-800" },
  proximo:       { label: "Próximo venc.",     badgeClass: "bg-amber-100 text-amber-800" },
  vencido:       { label: "Vencido",           badgeClass: "bg-red-100 text-red-800" },
  descartado:    { label: "Descartado",        badgeClass: "bg-gray-100 text-gray-600" },
  indeterminado: { label: "Indeterminado",     badgeClass: "bg-gray-100 text-gray-500" },
};

const SITUACAO_OPTIONS: { value: Situacao | ""; label: string }[] = [
  { value: "", label: "Todas as situações" },
  { value: "em_dia",        label: "Em dia" },
  { value: "proximo",       label: "Próximo do vencimento" },
  { value: "vencido",       label: "Vencido" },
  { value: "descartado",    label: "Descartado" },
  { value: "indeterminado", label: "Indeterminado" },
];

// ── Component ─────────────────────────────────────────────────────────────────

const EMPTY: PaginaBusca = {
  resultados: [],
  total: 0,
  pagina: 1,
  total_paginas: 1,
  contagens: { total: 0, em_dia: 0, proximo: 0, vencido: 0, descartado: 0, indeterminado: 0, com_irregularidade: 0 },
};

export function BuscaPage({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate  = useNavigate();

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filtros, setFiltros] = useState<FiltrosBusca>({});
  const [draft, setDraft]     = useState<FiltrosBusca>({});
  const [showFilters, setShowFilters] = useState(true);

  // ── Result state ────────────────────────────────────────────────────────────
  const [pagina, setPagina]         = useState<PaginaBusca>(EMPTY);
  const [loading, setLoading]       = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "csv" | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ── Region report (official ficha format) ─────────────────────────────────
  const [regioes, setRegioes]             = useState<RegiaoProgresso[]>([]);
  const [regiaoSel, setRegiaoSel]         = useState("");
  const [regBaixando, setRegBaixando]     = useState<"pdf" | "csv" | null>(null);
  const [regPreviewing, setRegPreviewing] = useState(false);
  const [regPreviewUrl, setRegPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    regioesApi.listar()
      .then((r) => { setRegioes(r.regioes); if (r.regioes[0]) setRegiaoSel(r.regioes[0].nome); })
      .catch(() => {/* regions optional on this page */});
  }, []);

  useEffect(() => () => { if (regPreviewUrl) URL.revokeObjectURL(regPreviewUrl); }, [regPreviewUrl]);

  async function previewRegiao() {
    if (!regiaoSel) return;
    setRegPreviewing(true);
    try {
      const url = await relatorioApi.regiaoPreview(regiaoSel);
      setRegPreviewUrl(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao gerar pré-visualização.", "erro");
    } finally {
      setRegPreviewing(false);
    }
  }

  async function baixarRegiao(formato: "pdf" | "csv") {
    if (!regiaoSel) return;
    setRegBaixando(formato);
    try {
      await relatorioApi.regiao(regiaoSel, formato);
      toast("Relatório baixado.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao baixar relatório.", "erro");
    } finally {
      setRegBaixando(null);
    }
  }

  function fecharRegPreview() {
    if (regPreviewUrl) URL.revokeObjectURL(regPreviewUrl);
    setRegPreviewUrl(null);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (f: FiltrosBusca, page = 1) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setHasSearched(true);
    try {
      const result = await buscaApi.buscar({ ...f, page });
      setPagina(result);
      setFiltros({ ...f, page });
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast(err.message ?? "Erro ao buscar.", "erro");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(draft, 1);
  };

  const handleClearFilters = () => {
    setDraft({});
    doSearch({}, 1);
  };

  const handlePage = (p: number) => doSearch(filtros, p);

  const handleDownload = async (formato: "pdf" | "csv") => {
    setDownloading(formato);
    try {
      const { page: _page, ...filtrosSemPagina } = filtros;
      await relatorioApi.generico(filtrosSemPagina, formato);
    } catch (err: any) {
      toast(err.message ?? "Erro ao gerar relatório.", "erro");
    } finally {
      setDownloading(null);
    }
  };

  const draftAtivo = Object.values(draft).some(v => v !== undefined && v !== "" && v !== null);
  const filtrosAtivos = Object.entries(filtros)
    .filter(([k, v]) => k !== "page" && v !== undefined && v !== "" && v !== null)
    .length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          {!embedded && <h1 className="text-2xl font-bold text-gray-900">Busca e Relatórios</h1>}
          <p className="text-sm text-gray-500 mt-0.5">
            Filtre extintores por qualquer combinação de critérios e exporte o resultado.
          </p>
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className="btn btn-secondary flex items-center gap-2 text-sm"
        >
          <Filter className="w-4 h-4" />
          {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
          {filtrosAtivos > 0 && (
            <span className="ml-1 bg-brand-600 text-white text-xs rounded-full px-1.5 py-0.5">
              {filtrosAtivos}
            </span>
          )}
        </button>
      </div>

      {/* ── Official region report (ficha format) ───────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <MapPin className="w-4 h-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-gray-900">Relatório por Região (formato oficial)</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Gera a ficha oficial de inspeção (mesmo formato do modelo) com todos os extintores da região.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="label">Região</label>
            <select className="input" value={regiaoSel} onChange={(e) => setRegiaoSel(e.target.value)}>
              {regioes.length === 0 && <option value="">— nenhuma região —</option>}
              {regioes.map((r) => (
                <option key={r.nome} value={r.nome}>{r.nome} ({r.total_esperado})</option>
              ))}
            </select>
          </div>
          <button onClick={previewRegiao} disabled={!regiaoSel || regPreviewing} className="btn-primary">
            {regPreviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Pré-visualizar
          </button>
          <button onClick={() => baixarRegiao("pdf")} disabled={!regiaoSel || regBaixando === "pdf"} className="btn-secondary">
            {regBaixando === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
          </button>
          <button onClick={() => baixarRegiao("csv")} disabled={!regiaoSel || regBaixando === "csv"} className="btn-secondary">
            {regBaixando === "csv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Table2 className="w-4 h-4" />} CSV
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Número */}
            <div>
              <label className="form-label">Número</label>
              <input
                type="text"
                className="input"
                placeholder="Ex.: A-01"
                value={draft.numero ?? ""}
                onChange={e => setDraft(d => ({ ...d, numero: e.target.value || undefined }))}
              />
            </div>

            {/* Região */}
            <div>
              <label className="form-label">Região</label>
              <select
                className="input"
                value={draft.regiao ?? ""}
                onChange={e => setDraft(d => ({ ...d, regiao: e.target.value || undefined }))}
              >
                <option value="">Todas as regiões</option>
                {regioes.map((r) => (
                  <option key={r.nome} value={r.nome}>{r.nome} ({r.total_esperado})</option>
                ))}
              </select>
            </div>

            {/* Setor */}
            <div>
              <label className="form-label">Setor</label>
              <input
                type="text"
                className="input"
                placeholder="Ex.: Produção"
                value={draft.setor ?? ""}
                onChange={e => setDraft(d => ({ ...d, setor: e.target.value || undefined }))}
              />
            </div>

            {/* Tipo de carga */}
            <div>
              <label className="form-label">Tipo de carga</label>
              <input
                type="text"
                className="input"
                placeholder="Ex.: Pó ABC"
                value={draft.tipo_carga ?? ""}
                onChange={e => setDraft(d => ({ ...d, tipo_carga: e.target.value || undefined }))}
              />
            </div>

            {/* Situação */}
            <div>
              <label className="form-label">Situação</label>
              <select
                className="input"
                value={draft.situacao ?? ""}
                onChange={e => setDraft(d => ({
                  ...d,
                  situacao: (e.target.value as Situacao) || undefined,
                }))}
              >
                {SITUACAO_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Status geral */}
            <div>
              <label className="form-label">Status geral</label>
              <select
                className="input"
                value={draft.status_geral ?? ""}
                onChange={e => setDraft(d => ({ ...d, status_geral: e.target.value || undefined }))}
              >
                <option value="">Qualquer</option>
                <option value="Conforme">Conforme</option>
                <option value="Reprovado">Reprovado</option>
              </select>
            </div>

            {/* Irregularidade */}
            <div>
              <label className="form-label">Irregularidade</label>
              <select
                className="input"
                value={draft.tem_irregularidade === undefined ? "" : String(draft.tem_irregularidade)}
                onChange={e => setDraft(d => ({
                  ...d,
                  tem_irregularidade: e.target.value === "" ? undefined : e.target.value === "true",
                }))}
              >
                <option value="">Qualquer</option>
                <option value="true">Com irregularidade</option>
                <option value="false">Sem irregularidade</option>
              </select>
            </div>

            {/* Mês de referência */}
            <div>
              <label className="form-label">Mês de referência</label>
              <input
                type="text"
                className="input"
                placeholder="Ex.: Mai/2026"
                value={draft.mes_referencia ?? ""}
                onChange={e => setDraft(d => ({ ...d, mes_referencia: e.target.value || undefined }))}
              />
            </div>

            {/* Inspetor */}
            <div>
              <label className="form-label">Inspetor</label>
              <input
                type="text"
                className="input"
                placeholder="Nome parcial"
                value={draft.inspetor ?? ""}
                onChange={e => setDraft(d => ({ ...d, inspetor: e.target.value || undefined }))}
              />
            </div>

            {/* Vence em X dias */}
            <div>
              <label className="form-label">Vence em até (dias)</label>
              <input
                type="number"
                className="input"
                min={1}
                max={3650}
                placeholder="Ex.: 60"
                value={draft.vence_em_dias ?? ""}
                onChange={e => setDraft(d => ({
                  ...d,
                  vence_em_dias: e.target.value ? Number(e.target.value) : undefined,
                }))}
              />
            </div>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button type="submit" disabled={loading} className="btn btn-primary flex items-center gap-2">
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Search className="w-4 h-4" />}
              Buscar
            </button>

            {draftAtivo && (
              <button type="button" onClick={handleClearFilters} className="btn btn-secondary flex items-center gap-2">
                <X className="w-4 h-4" />
                Limpar filtros
              </button>
            )}
          </div>
        </form>
      )}

      {/* Results + export */}
      {hasSearched && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap text-sm">
              <span className="font-semibold text-gray-700">{pagina.total} extintor(es) encontrado(s)</span>
              {pagina.contagens.vencido > 0 && (
                <span className="flex items-center gap-1 text-red-600 font-medium">
                  <AlertCircle className="w-4 h-4" />
                  {pagina.contagens.vencido} vencido(s)
                </span>
              )}
              {pagina.contagens.proximo > 0 && (
                <span className="text-amber-600 font-medium">
                  {pagina.contagens.proximo} próx. venc.
                </span>
              )}
              {pagina.contagens.com_irregularidade > 0 && (
                <span className="text-orange-600 font-medium">
                  {pagina.contagens.com_irregularidade} c/ irregularidade
                </span>
              )}
            </div>

            {/* Export buttons */}
            {pagina.total > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload("pdf")}
                  disabled={downloading !== null}
                  className="btn btn-secondary flex items-center gap-1.5 text-sm"
                >
                  {downloading === "pdf"
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <FileText className="w-3.5 h-3.5" />}
                  PDF
                </button>
                <button
                  onClick={() => handleDownload("csv")}
                  disabled={downloading !== null}
                  className="btn btn-secondary flex items-center gap-1.5 text-sm"
                >
                  {downloading === "csv"
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Table2 className="w-3.5 h-3.5" />}
                  CSV
                </button>
              </div>
            )}
          </div>

          {/* Aggregate chips */}
          {pagina.total > 0 && (
            <div className="flex flex-wrap gap-2">
              {(["em_dia","proximo","vencido","descartado","indeterminado"] as Situacao[]).map(s => {
                const count = pagina.contagens[s];
                if (!count) return null;
                const meta = SITUACAO_META[s];
                return (
                  <span key={s} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.badgeClass}`}>
                    {meta.label}: {count}
                  </span>
                );
              })}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="card p-12 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
            </div>
          ) : pagina.resultados.length === 0 ? (
            <div className="card p-10 text-center text-gray-500 space-y-2">
              <Search className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="font-medium">Nenhum extintor encontrado</p>
              <p className="text-sm">Tente ajustar os filtros.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Número</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Unidade / Setor</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Tipo / Cap.</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Situação</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Venc. Carga</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Última Inspeção</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Relatório</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagina.resultados.map(r => (
                      <ResultRow key={r.id} r={r} navigate={navigate} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {pagina.resultados.map(r => (
                  <MobileCard key={r.id} r={r} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {/* Pagination */}
          {pagina.total_paginas > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Página {pagina.pagina} de {pagina.total_paginas}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePage(pagina.pagina - 1)}
                  disabled={pagina.pagina <= 1 || loading}
                  className="btn btn-secondary px-2 py-1.5"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePage(pagina.pagina + 1)}
                  disabled={pagina.pagina >= pagina.total_paginas || loading}
                  className="btn btn-secondary px-2 py-1.5"
                  aria-label="Próxima página"
                >
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

      {/* Region report PDF preview overlay */}
      {regPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col p-3 sm:p-6 animate-fade-in" onClick={fecharRegPreview}>
          <div className="flex items-center justify-between mb-2 text-white">
            <p className="text-sm font-medium">Pré-visualização — {regiaoSel}</p>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => baixarRegiao("pdf")} className="btn-secondary btn-sm">
                <Download className="w-3.5 h-3.5" /> Baixar PDF
              </button>
              <button onClick={fecharRegPreview} className="btn-secondary btn-sm">
                <X className="w-3.5 h-3.5" /> Fechar
              </button>
            </div>
          </div>
          <iframe
            title="Pré-visualização do relatório"
            src={regPreviewUrl}
            className="flex-1 w-full rounded-lg bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SituacaoBadge({ situacao }: { situacao: Situacao }) {
  const meta = SITUACAO_META[situacao];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.badgeClass}`}>
      {meta.label}
    </span>
  );
}

function ResultRow({ r, navigate }: { r: ResultadoBusca; navigate: ReturnType<typeof useNavigate> }) {
  const [dlPdf, setDlPdf] = useState(false);

  const handlePdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDlPdf(true);
    try {
      await relatorioApi.extintor(r.id, r.unidade, r.numero);
    } catch {
      /* toast already shown by api wrapper — keep it simple here */
    } finally {
      setDlPdf(false);
    }
  };

  return (
    <tr
      className={`hover:bg-gray-50 cursor-pointer transition-colors ${
        r.situacao === "vencido" ? "bg-red-50/40" : r.situacao === "proximo" ? "bg-amber-50/30" : ""
      }`}
      onClick={() => navigate(`/extintores/${r.id}`)}
    >
      <td className="px-4 py-3 font-mono font-semibold text-gray-800">{r.numero}</td>
      <td className="px-4 py-3">
        <span className="font-medium text-gray-800">{r.unidade}</span>
        {r.setor && <span className="text-gray-400 text-xs block">{r.setor}</span>}
      </td>
      <td className="px-4 py-3 text-gray-600">
        <span>{r.tipo_carga}</span>
        {r.capacidade && <span className="text-gray-400 text-xs block">{r.capacidade}</span>}
      </td>
      <td className="px-4 py-3"><SituacaoBadge situacao={r.situacao} /></td>
      <td className="px-4 py-3 text-gray-600">{r.vencimento_carga ?? "—"}</td>
      <td className="px-4 py-3">
        {r.ultima_inspecao
          ? <span className="text-gray-600">{r.ultima_inspecao.mes_referencia}</span>
          : <span className="text-gray-400">—</span>}
        {r.ultima_inspecao?.tem_irregularidade && (
          <span className="block text-xs text-red-500 font-medium">⚠ irregularidade</span>
        )}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={handlePdf}
          disabled={dlPdf}
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium"
          title="Baixar PDF deste extintor"
        >
          {dlPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          PDF
        </button>
      </td>
    </tr>
  );
}

function MobileCard({ r, navigate }: { r: ResultadoBusca; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div
      className={`px-4 py-3 cursor-pointer hover:bg-gray-50 space-y-1 ${
        r.situacao === "vencido" ? "border-l-4 border-red-400" :
        r.situacao === "proximo" ? "border-l-4 border-amber-400" : ""
      }`}
      onClick={() => navigate(`/extintores/${r.id}`)}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono font-bold text-gray-800">{r.numero}</span>
        <SituacaoBadge situacao={r.situacao} />
      </div>
      <p className="text-sm text-gray-600">{r.unidade}{r.setor ? ` — ${r.setor}` : ""}</p>
      <p className="text-xs text-gray-500">{r.tipo_carga}{r.vencimento_carga ? ` · venc. ${r.vencimento_carga}` : ""}</p>
      {r.ultima_inspecao && (
        <p className="text-xs text-gray-400">
          Última inspeção: {r.ultima_inspecao.mes_referencia}
          {r.ultima_inspecao.tem_irregularidade && <span className="text-red-500 ml-1">⚠</span>}
        </p>
      )}
    </div>
  );
}
