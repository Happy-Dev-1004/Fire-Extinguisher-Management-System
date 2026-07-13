import { useEffect, useState, useCallback } from "react";
import {
  alarmeApi,
  type DispositivoBusca, type PaginaBuscaAlarme, type FiltrosAlarme, type Central,
} from "../lib/api";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import {
  Download, Loader2, Filter, CheckCircle2, Circle, FileDown,
  Plus, Pencil, Trash2, Image as ImageIcon, X,
} from "lucide-react";

const STATUS_META: Record<string, { label: string; color: string }> = {
  pendente:   { label: "Pendente",   color: "text-gray-600" },
  instalado:  { label: "Instalado",  color: "text-blue-700" },
  enderecado: { label: "Endereçado", color: "text-violet-700" },
  testado:    { label: "Testado",    color: "text-green-700" },
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

// Fase 2 · Busca / Relatórios — a página independente de busca de dispositivos
// (antes embutida na aba Progresso), espelhando as Fases 1/3.
export function AlarmeBuscaPage() {
  const [f, setF] = useState<FiltrosAlarme>({});
  const [pagina, setPagina] = useState<PaginaBuscaAlarme | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);

  const [centrais, setCentrais] = useState<Central[]>([]);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<DispForm>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  const [galeria, setGaleria] = useState<{ device: DispositivoBusca; fotos: string[] } | null>(null);
  const [carregandoFotos, setCarregandoFotos] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const buscar = useCallback(async (page = 1) => {
    setCarregando(true);
    try {
      const r = await alarmeApi.busca({ ...f, page });
      setPagina(r);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro na busca.", "erro");
    } finally { setCarregando(false); }
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
    } finally { setExportando(false); }
  };

  function abrirNovo() {
    setEditId(null);
    setForm({ ...FORM_VAZIO, central_id: centrais[0]?.id ?? "" });
    setModal(true);
  }
  async function abrirEditar(id: string) {
    setEditId(id); setModal(true); setForm(FORM_VAZIO);
    try {
      const d = await alarmeApi.dispositivo(id);
      setForm({
        central_id: d.central_id ?? "",
        tipo_dispositivo: d.tipo_dispositivo ?? "detector_fumaca",
        setor: d.setor ?? "", laco: d.laco != null ? String(d.laco) : "",
        endereco: d.endereco ?? "", status_instalacao: d.status_instalacao ?? "pendente",
        data_instalacao: d.data_instalacao ?? "", descricao: "", observacoes: "",
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar dispositivo.", "erro");
      setModal(false);
    }
  }

  async function abrirGaleria(d: DispositivoBusca) {
    setGaleria({ device: d, fotos: [] });
    setCarregandoFotos(true);
    try {
      const full = await alarmeApi.dispositivo(d.id);
      setGaleria({ device: d, fotos: full.fotos ?? [] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao carregar fotos.", "erro");
      setGaleria(null);
    } finally { setCarregandoFotos(false); }
  }

  async function salvar() {
    if (!form.central_id) { toast("Selecione a central.", "erro"); return; }
    if (!form.setor.trim()) { toast("Informe o setor.", "erro"); return; }
    const laco = form.laco.trim() ? parseInt(form.laco, 10) : null;
    if (form.laco.trim() && (!Number.isFinite(laco!) || laco! <= 0)) { toast("Laço inválido.", "erro"); return; }
    setSalvando(true);
    try {
      const corpo = {
        central_id: form.central_id, tipo_dispositivo: form.tipo_dispositivo, setor: form.setor.trim(),
        laco, endereco: form.endereco.trim() || null,
        status_instalacao: form.status_instalacao, data_instalacao: form.data_instalacao.trim() || null,
      };
      if (editId) { await alarmeApi.atualizar(editId, corpo); toast("Dispositivo atualizado.", "sucesso"); }
      else { await alarmeApi.criar(corpo); toast("Dispositivo adicionado.", "sucesso"); }
      setModal(false);
      await buscar(pagina?.pagina ?? 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao salvar dispositivo.", "erro");
    } finally { setSalvando(false); }
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
    } finally { setRemovendoId(null); }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Filter className="w-5 h-5 text-brand-600" />
        <h1 className="text-xl font-bold text-gray-900">Busca / Relatórios — Dispositivos</h1>
        <button onClick={abrirNovo} className="btn-primary btn-sm ml-auto">
          <Plus className="w-3.5 h-3.5" /> Adicionar dispositivo
        </button>
      </div>
      <p className="text-sm text-gray-500 -mt-1">
        Filtre os dispositivos do alarme por central, tipo, setor ou status, veja as fotos e exporte em PDF/CSV.
      </p>

      <div className="card p-5 space-y-4">
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

        {/* Quick filters */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setF((p) => ({ ...p, status_instalacao: "pendente" })); buscar(1); }}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${f.status_instalacao === "pendente" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>Não instalados</button>
          <button onClick={() => { setF((p) => ({ ...p, status_instalacao: "instalado" })); buscar(1); }}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${f.status_instalacao === "instalado" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>Instalados</button>
          <button onClick={() => { setF((p) => ({ ...p, com_foto: "true" })); buscar(1); }}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${f.com_foto === "true" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>Com foto</button>
          {(f.status_instalacao || f.com_foto) && (
            <button onClick={() => { setF((p) => ({ ...p, status_instalacao: undefined, com_foto: undefined })); buscar(1); }}
              className="px-3 py-1 rounded-full text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50">Limpar</button>
          )}
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
                <button onClick={() => exportar("pdf")} className="btn-ghost text-xs" disabled={exportando}><FileDown className="w-3.5 h-3.5 mr-1" /> PDF</button>
                <button onClick={() => exportar("csv")} className="btn-ghost text-xs" disabled={exportando}><Download className="w-3.5 h-3.5 mr-1" /> CSV</button>
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
                    <th className="px-2 py-2 text-center">Instalado?</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-center">Fotos</th>
                    <th className="px-2 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.resultados.map((d: DispositivoBusca) => {
                    const instalado = d.status_instalacao != null && d.status_instalacao !== "pendente";
                    return (
                      <tr key={d.id} className={`border-b border-gray-100 ${!instalado ? "bg-gray-50/40" : ""}`}>
                        <td className="px-2 py-2">{d.central_numero != null ? `C${d.central_numero}` : "—"}</td>
                        <td className="px-2 py-2">{d.laco ?? "—"}</td>
                        <td className="px-2 py-2">{d.endereco ?? <span className="text-amber-600">pendente</span>}</td>
                        <td className="px-2 py-2">{d.tipo_label}</td>
                        <td className="px-2 py-2 max-w-[140px] truncate">{d.setor ?? "—"}</td>
                        <td className="px-2 py-2 text-center">
                          {instalado
                            ? <span title="Instalado" className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle2 className="w-4 h-4" /> Sim</span>
                            : <span title="Ainda não instalado" className="inline-flex items-center gap-1 text-gray-400"><Circle className="w-4 h-4" /> Não</span>}
                        </td>
                        <td className="px-2 py-2">
                          <span className={`badge ${d.status_instalacao === "testado" ? "badge-green" : d.status_instalacao === "pendente" ? "badge-gray" : "badge-brand"}`}>{d.status_label}</span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {d.qtd_fotos > 0 ? (
                            <button onClick={() => abrirGaleria(d)} title="Ver fotos da instalação" className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 font-medium">
                              <ImageIcon className="w-3.5 h-3.5" /> {d.qtd_fotos}
                            </button>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => abrirEditar(d.id)} title="Editar dispositivo" className="btn-ghost btn-sm p-1 text-gray-500 hover:text-gray-800"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => remover(d)} disabled={removendoId === d.id} title="Remover dispositivo" className="btn-ghost btn-sm p-1 text-red-600 hover:text-red-700">
                              {removendoId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pagina.resultados.length === 0 && (
                    <tr><td colSpan={9} className="px-2 py-6 text-center text-gray-400">Nenhum dispositivo para os filtros.</td></tr>
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
      </div>

      {/* Device photo gallery */}
      <Modal
        open={galeria !== null}
        titulo={galeria ? `Fotos — ${galeria.device.tipo_label}${galeria.device.endereco ? ` ${galeria.device.endereco}` : ""}${galeria.device.setor ? ` · ${galeria.device.setor}` : ""}` : "Fotos"}
        onClose={() => setGaleria(null)}
        largura="max-w-2xl"
      >
        {carregandoFotos ? (
          <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando fotos…</div>
        ) : galeria && galeria.fotos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {galeria.fotos.map((url, i) => (
              <button key={i} onClick={() => setLightbox(url)} className="block aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-brand-500">
                <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-6 text-center">Este dispositivo ainda não tem fotos de instalação.</p>
        )}
      </Modal>

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}><X className="w-6 h-6" /></button>
          <img src={lightbox} alt="Foto ampliada" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Device create/edit modal */}
      <Modal open={modal} titulo={editId ? "Editar dispositivo" : "Adicionar dispositivo"} onClose={() => { if (!salvando) setModal(false); }} largura="max-w-lg">
        <div className="space-y-4">
          <p className="text-xs text-gray-400">Central, tipo e setor são obrigatórios. Laço e endereço podem ser preenchidos depois (cadastro incremental).</p>
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
