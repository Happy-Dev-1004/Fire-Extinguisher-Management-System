import { useEffect, useState, useCallback } from "react";
import {
  alarmeApi,
  type RelatorioProgresso, type ContagemStatus, type GrupoCentral,
  type DispositivoBusca, type PaginaBuscaAlarme, type FiltrosAlarme, type Central,
} from "../lib/api";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import {
  Activity, AlertTriangle, Download, Loader2,
  ChevronDown, ChevronRight, Filter, CheckCircle2, FileDown,
  Plus, Pencil, Trash2,
} from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string; bar: string }> = {
  pendente:   { label: "Pendente",   color: "text-gray-600",   bar: "bg-gray-400" },
  instalado:  { label: "Instalado",  color: "text-blue-700",   bar: "bg-blue-500" },
  enderecado: { label: "Endereçado", color: "text-violet-700", bar: "bg-violet-500" },
  testado:    { label: "Testado",    color: "text-green-700",  bar: "bg-green-500" },
};
const STATUS_ORDER = ["pendente", "instalado", "enderecado", "testado"] as const;

const TIPOS = [
  { v: "detector_fumaca", l: "Detector de fumaça" },
  { v: "detector_temperatura", l: "Detector de temperatura" },
  { v: "detector_linear", l: "Detector linear" },
  { v: "acionador", l: "Acionador manual" },
  { v: "sirene", l: "Sirene" },
  { v: "modulo_supervisao", l: "Módulo de supervisão" },
  { v: "isolador", l: "Isolador" },
];

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
          <ReconciliacaoCard prog={prog} />
          <CentraisProgresso centrais={prog.centrais} />
          <BuscaDispositivos />
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

// ── BOM gaps ──────────────────────────────────────────────────────────────────
function ReconciliacaoCard({ prog }: { prog: RelatorioProgresso }) {
  const rec = prog.reconciliacao;
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <h2 className="text-sm font-bold text-gray-900">Lacunas do projeto (BOM)</h2>
        {rec.completo ? (
          <span className="badge badge-green ml-auto">Completo</span>
        ) : (
          <span className="badge badge-gray ml-auto">{rec.total_faltam} faltando</span>
        )}
      </div>
      <div className="space-y-2">
        {rec.linhas.filter((l) => l.esperado > 0).map((l) => {
          const pct = l.esperado > 0 ? Math.round((l.cadastrados / l.esperado) * 100) : 0;
          return (
            <div key={l.tipo} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-44 shrink-0">{l.label}</span>
              <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={l.faltam > 0 ? "bg-amber-500 h-full" : "bg-green-500 h-full"} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <span className="text-xs text-gray-700 w-28 text-right shrink-0">
                {l.cadastrados}/{l.esperado}
                {l.faltam > 0 && <span className="text-amber-700"> · faltam {l.faltam}</span>}
                {l.completo && <CheckCircle2 className="w-3 h-3 inline-block ml-1 text-green-600" />}
              </span>
            </div>
          );
        })}
      </div>
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
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-3 text-left">
        {aberto ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
          <p className="text-xs text-gray-400">{c.contagem.total} dispositivo(s)</p>
        </div>
        <div className="w-40 sm:w-64 shrink-0"><BarraStatus c={c.contagem} /></div>
      </button>
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

// ── Device search with filters + export ─────────────────────────────────────────
// All device types (includes "outro", used only in the create/edit form).
const TIPOS_FORM = [...TIPOS, { v: "outro", l: "Outro" }];

interface DispForm {
  central_id: string; tipo_dispositivo: string; setor: string;
  laco: string; endereco: string; status_instalacao: string;
  data_instalacao: string; descricao: string; observacoes: string;
}
const FORM_VAZIO: DispForm = {
  central_id: "", tipo_dispositivo: "detector_fumaca", setor: "",
  laco: "", endereco: "", status_instalacao: "pendente",
  data_instalacao: "", descricao: "", observacoes: "",
};

function BuscaDispositivos() {
  const [f, setF] = useState<FiltrosAlarme>({});
  const [pagina, setPagina] = useState<PaginaBuscaAlarme | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);

  // Centrais (for the device form picker) + add/edit/delete state.
  const [centrais, setCentrais] = useState<Central[]>([]);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);   // null = creating
  const [form, setForm] = useState<DispForm>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const buscar = useCallback(async (page = 1) => {
    setCarregando(true);
    try {
      const r = await alarmeApi.busca({ ...f, page });
      setPagina(r);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro na busca.", "erro");
    } finally {
      setCarregando(false);
    }
  }, [f]);

  useEffect(() => { buscar(1); /* initial */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    alarmeApi.centrais().then((r) => setCentrais(r.centrais)).catch(() => {/* picker optional */});
  }, []);

  const set = (k: keyof FiltrosAlarme, v: string) => setF((p) => ({ ...p, [k]: v || undefined }));

  const exportar = async (formato: "pdf" | "csv") => {
    setExportando(true);
    try {
      const { page, ...semPage } = f; void page;
      await alarmeApi.buscaRelatorio(semPage, formato);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao exportar.", "erro");
    } finally {
      setExportando(false);
    }
  };

  function abrirNovo() {
    setEditId(null);
    setForm({ ...FORM_VAZIO, central_id: centrais[0]?.id ?? "" });
    setModal(true);
  }

  async function abrirEditar(id: string) {
    setEditId(id);
    setModal(true);
    setForm(FORM_VAZIO);
    try {
      const d = await alarmeApi.dispositivo(id);
      setForm({
        central_id: d.central_id ?? "",
        tipo_dispositivo: d.tipo_dispositivo ?? "detector_fumaca",
        setor: d.setor ?? "",
        laco: d.laco != null ? String(d.laco) : "",
        endereco: d.endereco ?? "",
        status_instalacao: d.status_instalacao ?? "pendente",
        data_instalacao: d.data_instalacao ?? "",
        descricao: "", observacoes: "",
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar dispositivo.", "erro");
      setModal(false);
    }
  }

  async function salvar() {
    if (!form.central_id) { toast("Selecione a central.", "erro"); return; }
    if (!form.setor.trim()) { toast("Informe o setor.", "erro"); return; }
    const laco = form.laco.trim() ? parseInt(form.laco, 10) : null;
    if (form.laco.trim() && (!Number.isFinite(laco!) || laco! <= 0)) { toast("Laço inválido.", "erro"); return; }
    setSalvando(true);
    try {
      const corpo = {
        central_id: form.central_id,
        tipo_dispositivo: form.tipo_dispositivo,
        setor: form.setor.trim(),
        laco,
        endereco: form.endereco.trim() || null,
        status_instalacao: form.status_instalacao,
        data_instalacao: form.data_instalacao.trim() || null,
      };
      if (editId) {
        await alarmeApi.atualizar(editId, corpo);
        toast("Dispositivo atualizado.", "sucesso");
      } else {
        await alarmeApi.criar(corpo);
        toast("Dispositivo adicionado.", "sucesso");
      }
      setModal(false);
      await buscar(pagina?.pagina ?? 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao salvar dispositivo.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(d: DispositivoBusca) {
    if (!window.confirm(`Remover este dispositivo (${d.tipo_label}${d.endereco ? ` ${d.endereco}` : ""})? Ele sairá das listas e relatórios.`)) return;
    setRemovendoId(d.id);
    try {
      await alarmeApi.remover(d.id);
      toast("Dispositivo removido.", "sucesso");
      await buscar(pagina?.pagina ?? 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao remover.", "erro");
    } finally {
      setRemovendoId(null);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-bold text-gray-900">Buscar dispositivos</h2>
        <button onClick={abrirNovo} className="btn-primary btn-sm ml-auto">
          <Plus className="w-3.5 h-3.5" /> Adicionar dispositivo
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <select className="input" value={f.central_numero ?? ""} onChange={(e) => set("central_numero", e.target.value)}>
          <option value="">Todas as centrais</option>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Central {n}</option>)}
        </select>
        <select className="input" value={f.tipo_dispositivo ?? ""} onChange={(e) => set("tipo_dispositivo", e.target.value)}>
          <option value="">Todos os tipos</option>
          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <select className="input" value={f.status_instalacao ?? ""} onChange={(e) => set("status_instalacao", e.target.value)}>
          <option value="">Todos os status</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <input className="input" placeholder="Setor" value={f.setor ?? ""} onChange={(e) => set("setor", e.target.value)} />
        <button onClick={() => buscar(1)} className="btn-primary" disabled={carregando}>
          {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
        </button>
      </div>

      {pagina && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-gray-500">{pagina.total} resultado(s)</span>
            {STATUS_ORDER.map((s) => (
              <span key={s} className={STATUS_META[s].color}>{STATUS_META[s].label}: <strong>{pagina.contagens[s]}</strong></span>
            ))}
            {pagina.contagens.cadastro_pendente > 0 && (
              <span className="text-amber-700">Cadastro incompleto: <strong>{pagina.contagens.cadastro_pendente}</strong></span>
            )}
            <div className="ml-auto flex gap-2">
              <button onClick={() => exportar("pdf")} className="btn-ghost text-xs" disabled={exportando}>
                <FileDown className="w-3.5 h-3.5 mr-1" /> PDF
              </button>
              <button onClick={() => exportar("csv")} className="btn-ghost text-xs" disabled={exportando}>
                <Download className="w-3.5 h-3.5 mr-1" /> CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-2 py-2">Central</th>
                  <th className="px-2 py-2">Laço</th>
                  <th className="px-2 py-2">Endereço</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2">Setor</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-center">Fotos</th>
                  <th className="px-2 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pagina.resultados.map((d: DispositivoBusca) => (
                  <tr key={d.id} className="border-b border-gray-100">
                    <td className="px-2 py-2">{d.central_numero != null ? `C${d.central_numero}` : "—"}</td>
                    <td className="px-2 py-2">{d.laco ?? "—"}</td>
                    <td className="px-2 py-2">{d.endereco ?? <span className="text-amber-600">pendente</span>}</td>
                    <td className="px-2 py-2">{d.tipo_label}</td>
                    <td className="px-2 py-2 max-w-[140px] truncate">{d.setor ?? "—"}</td>
                    <td className="px-2 py-2">
                      <span className={`badge ${d.status_instalacao === "testado" ? "badge-green" : d.status_instalacao === "pendente" ? "badge-gray" : "badge-brand"}`}>
                        {d.status_label}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">{d.qtd_fotos}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEditar(d.id)} title="Editar dispositivo" className="btn-ghost btn-sm p-1 text-gray-500 hover:text-gray-800">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remover(d)} disabled={removendoId === d.id} title="Remover dispositivo" className="btn-ghost btn-sm p-1 text-red-600 hover:text-red-700">
                          {removendoId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pagina.resultados.length === 0 && (
                  <tr><td colSpan={8} className="px-2 py-6 text-center text-gray-400">Nenhum dispositivo para os filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {pagina.total_paginas > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <button className="btn-ghost text-xs" disabled={pagina.pagina <= 1} onClick={() => buscar(pagina.pagina - 1)}>Anterior</button>
              <span className="text-gray-500">{pagina.pagina} / {pagina.total_paginas}</span>
              <button className="btn-ghost text-xs" disabled={pagina.pagina >= pagina.total_paginas} onClick={() => buscar(pagina.pagina + 1)}>Próxima</button>
            </div>
          )}
        </>
      )}

      {/* Device create/edit modal */}
      <Modal open={modal} titulo={editId ? "Editar dispositivo" : "Adicionar dispositivo"} onClose={() => { if (!salvando) setModal(false); }} largura="max-w-lg">
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Central, tipo e setor são obrigatórios. Laço e endereço podem ser preenchidos depois (cadastro incremental).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Central *</label>
              <select className="input" value={form.central_id} onChange={(e) => setForm((p) => ({ ...p, central_id: e.target.value }))}>
                <option value="">— selecione —</option>
                {centrais.map((c) => <option key={c.id} value={c.id}>Central {c.numero}{c.nome ? ` · ${c.nome}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo *</label>
              <select className="input" value={form.tipo_dispositivo} onChange={(e) => setForm((p) => ({ ...p, tipo_dispositivo: e.target.value }))}>
                {TIPOS_FORM.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status_instalacao} onChange={(e) => setForm((p) => ({ ...p, status_instalacao: e.target.value }))}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Setor *</label>
              <input className="input" value={form.setor} onChange={(e) => setForm((p) => ({ ...p, setor: e.target.value }))} placeholder="Ex.: Caldeira" />
            </div>
            <div>
              <label className="label">Laço</label>
              <input className="input" type="number" min={1} value={form.laco} onChange={(e) => setForm((p) => ({ ...p, laco: e.target.value }))} placeholder="opcional" />
            </div>
            <div>
              <label className="label">Endereço</label>
              <input className="input" value={form.endereco} onChange={(e) => setForm((p) => ({ ...p, endereco: e.target.value }))} placeholder="Ex.: 101 (opcional)" />
            </div>
            <div className="col-span-2">
              <label className="label">Data de instalação</label>
              <input className="input" type="date" value={form.data_instalacao} onChange={(e) => setForm((p) => ({ ...p, data_instalacao: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => setModal(false)} disabled={salvando} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={salvar} disabled={salvando} className="btn-primary flex-1">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : (editId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
              {editId ? "Salvar" : "Adicionar"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
