import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { alarmeApi, type DispositivoBusca, type Central } from "../lib/api";
import { downscaleToBase64 } from "../lib/foto";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import {
  ArrowLeft, Loader2, Search, Filter, Plus, Pencil, Trash2, Activity,
  ImageIcon, ImagePlus, X, CheckCircle2, Circle,
} from "lucide-react";

const TIPOS = [
  { v: "detector_fumaca", l: "Detector de fumaça" },
  { v: "detector_temperatura", l: "Detector de temperatura" },
  { v: "detector_linear", l: "Detector linear" },
  { v: "acionador", l: "Acionador manual" },
  { v: "sirene", l: "Sirene" },
  { v: "modulo_supervisao", l: "Módulo de supervisão" },
  { v: "isolador", l: "Isolador" },
  { v: "outro", l: "Outro" },
];
const STATUS = ["pendente", "instalado", "enderecado", "testado"] as const;
const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente", instalado: "Instalado", enderecado: "Endereçado", testado: "Testado",
};

interface DispForm {
  central_id: string; tipo_dispositivo: string; setor: string;
  laco: string; endereco: string; status_instalacao: string; data_instalacao: string;
}
const FORM_VAZIO: DispForm = {
  central_id: "", tipo_dispositivo: "detector_fumaca", setor: "",
  laco: "", endereco: "", status_instalacao: "pendente", data_instalacao: "",
};

export function CentralDetailPage() {
  const { numero = "" } = useParams();
  const centralNumero = Number(numero);

  const [central, setCentral] = useState<Central | null>(null);
  const [dispositivos, setDispositivos] = useState<DispositivoBusca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "instalado" | "pendente">("todos");

  // Add/edit modal
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<DispForm>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  // Photo gallery
  const [galeria, setGaleria] = useState<{ device: DispositivoBusca; fotos: string[] } | null>(null);
  const [carregandoFotos, setCarregandoFotos] = useState(false);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // Fetch ALL devices of this central (page size 50 in the API; loop pages).
      const todos: DispositivoBusca[] = [];
      let page = 1, totalPaginas = 1;
      do {
        const r = await alarmeApi.busca({ central_numero: centralNumero, page });
        todos.push(...r.resultados);
        totalPaginas = r.total_paginas;
        page++;
      } while (page <= totalPaginas);
      setDispositivos(todos);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar dispositivos.", "erro");
    } finally { setCarregando(false); }
  }, [centralNumero]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    alarmeApi.centrais().then((r) => setCentral(r.centrais.find((c) => c.numero === centralNumero) ?? null)).catch(() => {});
  }, [centralNumero]);

  const instalado = (d: DispositivoBusca) => d.status_instalacao !== "pendente";
  const visivel = dispositivos.filter((d) => {
    if (filtroStatus === "instalado" && !instalado(d)) return false;
    if (filtroStatus === "pendente" && instalado(d)) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      if (!(d.endereco ?? "").toLowerCase().includes(q) &&
          !(d.setor ?? "").toLowerCase().includes(q) &&
          !d.tipo_label.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const nInstalados = dispositivos.filter(instalado).length;

  function abrirNovo() {
    setEditId(null);
    setForm({ ...FORM_VAZIO, central_id: central?.id ?? "" });
    setModal(true);
  }
  async function abrirEditar(id: string) {
    setEditId(id); setModal(true); setForm(FORM_VAZIO);
    try {
      const d = await alarmeApi.dispositivo(id);
      setForm({
        central_id: d.central_id ?? central?.id ?? "",
        tipo_dispositivo: d.tipo_dispositivo ?? "detector_fumaca",
        setor: d.setor ?? "", laco: d.laco != null ? String(d.laco) : "",
        endereco: d.endereco ?? "", status_instalacao: d.status_instalacao ?? "pendente",
        data_instalacao: d.data_instalacao ?? "",
      });
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao carregar dispositivo.", "erro"); setModal(false); }
  }

  async function salvar() {
    const centralId = form.central_id || central?.id;
    if (!centralId) { toast("Central não encontrada.", "erro"); return; }
    if (!form.setor.trim()) { toast("Informe o setor.", "erro"); return; }
    const laco = form.laco.trim() ? parseInt(form.laco, 10) : null;
    if (form.laco.trim() && (!Number.isFinite(laco!) || laco! <= 0)) { toast("Laço inválido.", "erro"); return; }
    setSalvando(true);
    try {
      const corpo = {
        central_id: centralId, tipo_dispositivo: form.tipo_dispositivo, setor: form.setor.trim(),
        laco, endereco: form.endereco.trim() || null,
        status_instalacao: form.status_instalacao, data_instalacao: form.data_instalacao.trim() || null,
      };
      if (editId) { await alarmeApi.atualizar(editId, corpo); toast("Dispositivo atualizado.", "sucesso"); }
      else { await alarmeApi.criar(corpo); toast("Dispositivo adicionado.", "sucesso"); }
      setModal(false);
      await carregar();
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao salvar dispositivo.", "erro"); }
    finally { setSalvando(false); }
  }

  async function remover(d: DispositivoBusca) {
    if (!window.confirm(`Remover este dispositivo (${d.tipo_label}${d.endereco ? ` ${d.endereco}` : ""})? Ele sairá das listas e relatórios.`)) return;
    setRemovendoId(d.id);
    try {
      await alarmeApi.remover(d.id);
      setDispositivos((prev) => prev.filter((x) => x.id !== d.id));
      toast("Dispositivo removido.", "sucesso");
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao remover.", "erro"); }
    finally { setRemovendoId(null); }
  }

  async function abrirGaleria(d: DispositivoBusca) {
    setGaleria({ device: d, fotos: [] });
    setCarregandoFotos(true);
    try {
      const full = await alarmeApi.dispositivo(d.id);
      setGaleria({ device: d, fotos: full.fotos ?? [] });
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao carregar fotos.", "erro"); setGaleria(null); }
    finally { setCarregandoFotos(false); }
  }
  async function anexarFotos(files: FileList | null) {
    if (!files || !galeria) return;
    setEnviandoFotos(true);
    try {
      const b64s: string[] = [];
      for (const f of Array.from(files).slice(0, 10)) { const b = await downscaleToBase64(f); if (b) b64s.push(b); }
      if (b64s.length === 0) { toast("Não foi possível processar as imagens.", "erro"); return; }
      const v = await alarmeApi.adicionarFotos(galeria.device.id, b64s);
      setGaleria((g) => g ? { ...g, fotos: v.fotos } : g);
      toast(`${b64s.length} foto(s) anexada(s).`, "sucesso");
      await carregar();
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao anexar fotos.", "erro"); }
    finally { setEnviandoFotos(false); }
  }
  async function removerFoto(url: string) {
    if (!galeria) return;
    try {
      const v = await alarmeApi.removerFoto(galeria.device.id, url);
      setGaleria((g) => g ? { ...g, fotos: v.fotos } : g);
      await carregar();
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao remover foto.", "erro"); }
  }

  const titulo = `Central ${centralNumero}${central?.nome && central.nome !== `Central ${centralNumero}` ? ` — ${central.nome}` : ""}`;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <Link to="/alarme" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Progresso do alarme
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-400" />
            <h1 className="page-title">{titulo}</h1>
          </div>
          <button onClick={abrirNovo} className="btn-primary btn-sm"><Plus className="w-3.5 h-3.5" /> Novo dispositivo</button>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          {dispositivos.length} dispositivo(s) · {nInstalados} instalados · {dispositivos.length - nInstalados} pendentes
        </p>
      </div>

      {/* search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input className="input pl-9" placeholder="Buscar endereço, setor, tipo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {([["todos", "Todos"], ["pendente", "Não instalados"], ["instalado", "Instalados"]] as const).map(([key, label]) => {
          const count = key === "todos" ? dispositivos.length : key === "instalado" ? nInstalados : dispositivos.length - nInstalados;
          const active = filtroStatus === key;
          return (
            <button key={key} onClick={() => setFiltroStatus(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
              {label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : visivel.length === 0 ? (
        <div className="card p-10 text-center"><Filter className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-400">Nenhum dispositivo para os filtros aplicados.</p></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">Instalado?</th>
                  <th className="table-th">Laço</th>
                  <th className="table-th">Endereço</th>
                  <th className="table-th">Tipo</th>
                  <th className="table-th">Setor</th>
                  <th className="table-th">Status</th>
                  <th className="table-th text-center">Fotos</th>
                  <th className="table-th text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visivel.map((d) => (
                  <tr key={d.id} className={`table-row ${!instalado(d) ? "bg-gray-50/60" : ""}`}>
                    <td className="table-td">
                      {instalado(d)
                        ? <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Sim</span>
                        : <span className="inline-flex items-center gap-1 text-gray-400 text-xs"><Circle className="w-3.5 h-3.5" /> Não</span>}
                    </td>
                    <td className="table-td">{d.laco ?? "—"}</td>
                    <td className="table-td">{d.endereco ?? <span className="text-amber-600 dark:text-amber-400">pendente</span>}</td>
                    <td className="table-td">{d.tipo_label}</td>
                    <td className="table-td max-w-[160px] truncate" title={d.setor ?? ""}>{d.setor ?? "—"}</td>
                    <td className="table-td"><span className={`badge ${d.status_instalacao === "testado" ? "badge-green" : d.status_instalacao === "pendente" ? "badge-gray" : "badge-brand"}`}>{STATUS_LABEL[d.status_instalacao ?? "pendente"]}</span></td>
                    <td className="table-td text-center">
                      <button onClick={() => abrirGaleria(d)} className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:text-brand-700 text-xs" title="Ver fotos">
                        <ImageIcon className="w-3.5 h-3.5" /> {d.qtd_fotos}
                      </button>
                    </td>
                    <td className="table-td">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEditar(d.id)} className="btn-ghost btn-sm p-1 text-gray-500 hover:text-gray-800" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => remover(d)} disabled={removendoId === d.id} className="btn-ghost btn-sm p-1 text-red-600 hover:text-red-700 dark:text-red-400" title="Remover">
                          {removendoId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/edit modal */}
      <Modal open={modal} titulo={editId ? "Editar dispositivo" : `Novo dispositivo — ${titulo}`} onClose={() => { if (!salvando) setModal(false); }} largura="max-w-lg">
        <div className="space-y-4">
          <p className="text-xs text-gray-400">Tipo e setor são obrigatórios. Laço e endereço podem ser preenchidos depois.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo *</label>
              <select className="input" value={form.tipo_dispositivo} onChange={(e) => setForm((p) => ({ ...p, tipo_dispositivo: e.target.value }))}>
                {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status_instalacao} onChange={(e) => setForm((p) => ({ ...p, status_instalacao: e.target.value }))}>
                {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
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
              <input className="input" value={form.endereco} onChange={(e) => setForm((p) => ({ ...p, endereco: e.target.value }))} placeholder="Ex.: 26 (opcional)" />
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

      {/* Photo gallery modal */}
      <Modal open={!!galeria} titulo={galeria ? `Fotos — ${galeria.device.tipo_label}${galeria.device.endereco ? ` ${galeria.device.endereco}` : ""}` : ""} onClose={() => setGaleria(null)} largura="max-w-2xl">
        {galeria && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{galeria.device.setor ?? ""}{galeria.device.laco != null ? ` · Laço ${galeria.device.laco}` : ""}</p>
              <label className="btn-secondary btn-sm cursor-pointer">
                {enviandoFotos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Adicionar fotos
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => anexarFotos(e.target.files)} />
              </label>
            </div>
            {carregandoFotos ? (
              <div className="flex items-center gap-2 py-6 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : galeria.fotos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhuma foto para este dispositivo ainda.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {galeria.fotos.map((u) => (
                  <div key={u} className="relative group">
                    <img src={u} className="w-full h-24 object-cover rounded-lg border border-gray-200 cursor-pointer" onClick={() => setLightbox(u)} />
                    <button onClick={() => removerFoto(u)} className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Remover"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
