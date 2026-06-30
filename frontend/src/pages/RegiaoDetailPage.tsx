import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { regioesApi } from "../lib/api";
import type { ExtintorRegiao, StatusInspecao, Situacao } from "../lib/types";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import {
  ArrowLeft, Loader2, ShieldCheck, Clock, Circle, Search, Filter,
  ChevronRight, XCircle, CheckCircle2, HelpCircle, MapPin, Plus, Trash2,
} from "lucide-react";

// ── Situação (matches the Extintores page presentation) ───────────────────────
const SITUACAO_META: Record<Situacao, { label: string; badgeClass: string; rowClass: string; borderClass: string; Icon: React.ElementType }> = {
  vencido:       { label: "Vencido",         badgeClass: "badge-red",   rowClass: "bg-red-50/60",   borderClass: "border-l-4 border-l-red-500",   Icon: XCircle },
  descartado:    { label: "Descartado",       badgeClass: "badge-red",   rowClass: "bg-red-50/40",   borderClass: "border-l-4 border-l-red-400",   Icon: XCircle },
  proximo:       { label: "Próx. vencimento", badgeClass: "badge-amber", rowClass: "bg-amber-50/50", borderClass: "border-l-4 border-l-amber-400", Icon: Clock },
  em_dia:        { label: "Em dia",           badgeClass: "badge-green", rowClass: "",               borderClass: "",                              Icon: CheckCircle2 },
  indeterminado: { label: "Indeterminado",    badgeClass: "badge-gray",  rowClass: "bg-gray-50",     borderClass: "border-l-4 border-l-gray-300",  Icon: HelpCircle },
};

const STATUS_META: Record<StatusInspecao, { label: string; cls: string; Icon: React.ElementType }> = {
  verificado:             { label: "Verificado",             cls: "badge-green", Icon: ShieldCheck },
  aguardando_verificacao: { label: "Aguardando verificação", cls: "badge-amber", Icon: Clock },
  nao_inspecionado:       { label: "Não inspecionado",       cls: "badge-gray",  Icon: Circle },
};

const FILTROS_STATUS: Array<{ key: "todos" | StatusInspecao; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "aguardando_verificacao", label: "Aguardando" },
  { key: "verificado", label: "Verificados" },
  { key: "nao_inspecionado", label: "Não inspecionados" },
];

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

export function RegiaoDetailPage() {
  const { regiao = "" } = useParams();
  const nomeRegiao = decodeURIComponent(regiao);
  const navigate = useNavigate();

  const [extintores, setExtintores] = useState<ExtintorRegiao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusInspecao>("todos");
  const [busca, setBusca]   = useState("");

  // Add-extinguisher modal
  const [modalNovo, setModalNovo] = useState(false);
  const [salvando, setSalvando]   = useState(false);
  const [form, setForm] = useState({ numero_int: "", setor: "", tipo_carga: "", capacidade: "", vencimento_carga: "", vencimento_teste: "" });
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  useEffect(() => { void carregar(); }, [regiao]);

  async function abrirNovo() {
    setForm({ numero_int: "", setor: "", tipo_carga: "", capacidade: "", vencimento_carga: "", vencimento_teste: "" });
    setModalNovo(true);
    try {
      const { proximo } = await regioesApi.proximoNumero(nomeRegiao);
      setForm((f) => ({ ...f, numero_int: String(proximo) }));
    } catch { /* keep blank — server still defaults */ }
  }

  async function criarExtintor() {
    setSalvando(true);
    try {
      const numero_int = form.numero_int.trim() ? parseInt(form.numero_int, 10) : undefined;
      if (form.numero_int.trim() && (!Number.isFinite(numero_int!) || numero_int! <= 0)) {
        toast("Número inválido.", "erro"); setSalvando(false); return;
      }
      await regioesApi.criar({
        regiao: nomeRegiao,
        numero_int,
        setor: form.setor.trim() || undefined,
        tipo_carga: form.tipo_carga.trim() || undefined,
        capacidade: form.capacidade.trim() || undefined,
        vencimento_carga: form.vencimento_carga.trim() || undefined,
        vencimento_teste: form.vencimento_teste.trim() || undefined,
      });
      toast(`Extintor nº ${form.numero_int || "novo"} adicionado.`, "sucesso");
      setModalNovo(false);
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao adicionar extintor.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  async function removerExtintor(e: ExtintorRegiao, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!window.confirm(`Remover o extintor nº ${e.numero} de ${nomeRegiao}? Esta ação não pode ser desfeita.`)) return;
    setRemovendoId(e.id);
    try {
      await regioesApi.remover(e.id);
      toast(`Extintor nº ${e.numero} removido.`, "sucesso");
      setExtintores((prev) => prev.filter((x) => x.id !== e.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao remover extintor.", "erro");
    } finally {
      setRemovendoId(null);
    }
  }

  async function carregar() {
    setCarregando(true);
    try {
      const r = await regioesApi.extintores(nomeRegiao);
      setExtintores(r.extintores);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar extintores.", "erro");
    } finally {
      setCarregando(false);
    }
  }

  const contagens = extintores.reduce<Record<string, number>>((acc, e) => {
    acc[e.status_inspecao] = (acc[e.status_inspecao] ?? 0) + 1;
    return acc;
  }, {});

  const visivel = extintores.filter((e) => {
    if (filtroStatus !== "todos" && e.status_inspecao !== filtroStatus) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      if (!e.numero.toLowerCase().includes(q) &&
          !(e.setor ?? "").toLowerCase().includes(q) &&
          !(e.tipo_carga ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <Link to="/extintores" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Regiões
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-400" />
            <h1 className="page-title">{nomeRegiao}</h1>
          </div>
          <button onClick={abrirNovo} className="btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" /> Novo extintor
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{extintores.length} extintores · clique para ver detalhes, editar e verificar.</p>
      </div>

      {/* search + status filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input className="input pl-9" placeholder="Buscar nº, setor, tipo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTROS_STATUS.map(({ key, label }) => {
          const count = key === "todos" ? extintores.length : (contagens[key] ?? 0);
          const active = filtroStatus === key;
          return (
            <button key={key} onClick={() => setFiltroStatus(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-all ${
                active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}>
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : visivel.length === 0 ? (
        <div className="card p-10 text-center">
          <Filter className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Nenhum extintor encontrado para os filtros aplicados.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-th">Nº</th>
                    <th className="table-th">Setor</th>
                    <th className="table-th">Tipo / Carga</th>
                    <th className="table-th">Venc. carga</th>
                    <th className="table-th">Venc. teste</th>
                    <th className="table-th">Verificação</th>
                    <th className="table-th">Situação</th>
                    <th className="table-th w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {visivel.map((e) => {
                    const sit = e.situacao ?? "indeterminado";
                    const meta = SITUACAO_META[sit];
                    const st = STATUS_META[e.status_inspecao];
                    const critico = sit === "vencido" || sit === "descartado";
                    return (
                      <tr key={e.id} onClick={() => navigate(`/extintores/${e.id}`)}
                        className={`table-row cursor-pointer ${meta.rowClass} ${meta.borderClass}`}>
                        <td className={`table-td font-bold ${critico ? "text-red-700" : "text-gray-900"}`}>{e.numero}</td>
                        <td className="table-td text-gray-500">{e.setor || "—"}</td>
                        <td className="table-td">{e.tipo_carga ? <span className="badge-blue">{e.tipo_carga}</span> : <span className="text-gray-300">—</span>}</td>
                        <td className="table-td"><VencimentoCell valor={e.vencimento_carga} /></td>
                        <td className="table-td"><VencimentoCell valor={e.vencimento_teste} /></td>
                        <td className="table-td"><span className={st.cls}><st.Icon className="w-3 h-3" />{st.label}</span></td>
                        <td className="table-td"><span className={meta.badgeClass}><meta.Icon className="w-3 h-3" />{meta.label}</span></td>
                        <td className="table-td">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(ev) => removerExtintor(e, ev)}
                              disabled={removendoId === e.id}
                              title="Remover extintor"
                              className="btn-ghost btn-sm text-red-600 hover:text-red-700 p-1"
                            >
                              {removendoId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-400">
              {visivel.length} extintor{visivel.length !== 1 ? "es" : ""}{visivel.length < extintores.length && ` (de ${extintores.length} total)`}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {visivel.map((e) => {
              const sit = e.situacao ?? "indeterminado";
              const meta = SITUACAO_META[sit];
              const st = STATUS_META[e.status_inspecao];
              return (
                <div key={e.id} onClick={() => navigate(`/extintores/${e.id}`)}
                  className={`w-full text-left card p-4 flex items-start gap-3 cursor-pointer ${meta.rowClass} ${meta.borderClass}`}>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">Extintor {e.numero}</span>
                      <span className={meta.badgeClass}><meta.Icon className="w-3 h-3" />{meta.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                      {e.setor && <span>{e.setor}</span>}
                      {e.tipo_carga && <span>· {e.tipo_carga}</span>}
                    </div>
                    <span className={`${st.cls} text-[10px]`}><st.Icon className="w-3 h-3" />{st.label}</span>
                  </div>
                  <button
                    onClick={(ev) => removerExtintor(e, ev)}
                    disabled={removendoId === e.id}
                    title="Remover extintor"
                    className="btn-ghost btn-sm text-red-600 hover:text-red-700 p-1 shrink-0"
                  >
                    {removendoId === e.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add-extinguisher modal */}
      <Modal open={modalNovo} titulo={`Novo extintor — ${nomeRegiao}`} onClose={() => { if (!salvando) setModalNovo(false); }} largura="max-w-md">
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Adicione um extintor manualmente (instalado posteriormente ou correção do cadastro). Os demais dados podem ser preenchidos depois, na edição.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Número *</label>
              <input className="input" type="number" min={1} value={form.numero_int}
                onChange={(ev) => setForm((f) => ({ ...f, numero_int: ev.target.value }))} placeholder="auto" />
            </div>
            <div>
              <label className="label">Setor</label>
              <input className="input" value={form.setor} onChange={(ev) => setForm((f) => ({ ...f, setor: ev.target.value }))} />
            </div>
            <div>
              <label className="label">Tipo de carga</label>
              <input className="input" value={form.tipo_carga} onChange={(ev) => setForm((f) => ({ ...f, tipo_carga: ev.target.value }))} placeholder="Ex.: Pó ABC" />
            </div>
            <div>
              <label className="label">Capacidade</label>
              <input className="input" value={form.capacidade} onChange={(ev) => setForm((f) => ({ ...f, capacidade: ev.target.value }))} placeholder="Ex.: 6kg" />
            </div>
            <div>
              <label className="label">Venc. carga</label>
              <input className="input" value={form.vencimento_carga} onChange={(ev) => setForm((f) => ({ ...f, vencimento_carga: ev.target.value }))} placeholder="Ex.: 05/2027" />
            </div>
            <div>
              <label className="label">Venc. teste</label>
              <input className="input" value={form.vencimento_teste} onChange={(ev) => setForm((f) => ({ ...f, vencimento_teste: ev.target.value }))} placeholder="Ex.: 05/2030" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => setModalNovo(false)} disabled={salvando} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={criarExtintor} disabled={salvando} className="btn-primary flex-1">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
