import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { hidrantesApi } from "../lib/api";
import type { Hidrante, StatusInspecao, SituacaoHidrante } from "../lib/types";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import {
  ArrowLeft, Loader2, ShieldCheck, Clock, Circle, Search, Filter,
  ChevronRight, AlertTriangle, CheckCircle2, HelpCircle, Droplets, Check, Plus, Trash2,
} from "lucide-react";

// ── Situação (matches the Hidrantes page presentation) ────────────────────────
const SITUACAO_META: Record<SituacaoHidrante, { label: string; badgeClass: string; rowClass: string; borderClass: string; Icon: React.ElementType }> = {
  atencao:       { label: "Atenção",       badgeClass: "badge-red",   rowClass: "bg-red-50/60",   borderClass: "border-l-4 border-l-red-500",   Icon: AlertTriangle },
  pendente:      { label: "Pendente",      badgeClass: "badge-amber", rowClass: "bg-amber-50/50", borderClass: "border-l-4 border-l-amber-400", Icon: Clock },
  ok:            { label: "OK",            badgeClass: "badge-green", rowClass: "",               borderClass: "",                              Icon: CheckCircle2 },
  indeterminado: { label: "Indeterminado", badgeClass: "badge-gray",  rowClass: "bg-gray-50",     borderClass: "border-l-4 border-l-gray-300",  Icon: HelpCircle },
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

export function UnidadeHidranteDetailPage() {
  const { unidade = "" } = useParams();
  const nomeUnidade = decodeURIComponent(unidade);
  const navigate = useNavigate();

  const [hidrantes, setHidrantes] = useState<Hidrante[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusInspecao>("todos");
  const [busca, setBusca]   = useState("");
  const [verificando, setVerificando] = useState<string | null>(null);

  // Add-hydrant modal
  const [modalNovo, setModalNovo] = useState(false);
  const [salvando, setSalvando]   = useState(false);
  const [form, setForm] = useState({ numero_int: "", numero: "", setor: "", esguicho: "", mangueira: "", chave_storz: "" });
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  useEffect(() => { void carregar(); }, [unidade]);

  async function abrirNovo() {
    setForm({ numero_int: "", numero: "", setor: "", esguicho: "", mangueira: "", chave_storz: "" });
    setModalNovo(true);
    try {
      const { proximo } = await hidrantesApi.proximoNumero(nomeUnidade);
      setForm((f) => ({ ...f, numero_int: String(proximo), numero: "H" + String(proximo).padStart(2, "0") }));
    } catch { /* keep blank — server still defaults */ }
  }

  async function criarHidrante() {
    setSalvando(true);
    try {
      const numero_int = form.numero_int.trim() ? parseInt(form.numero_int, 10) : undefined;
      if (form.numero_int.trim() && (!Number.isFinite(numero_int!) || numero_int! <= 0)) {
        toast("Número inválido.", "erro"); setSalvando(false); return;
      }
      await hidrantesApi.criar({
        unidade: nomeUnidade,
        numero_int,
        numero: form.numero.trim() || undefined,
        setor: form.setor.trim() || undefined,
        esguicho: form.esguicho.trim() || undefined,
        mangueira: form.mangueira.trim() || undefined,
        chave_storz: form.chave_storz.trim() || undefined,
      });
      toast(`Hidrante ${form.numero || form.numero_int || "novo"} adicionado.`, "sucesso");
      setModalNovo(false);
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao adicionar hidrante.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  async function removerHidrante(h: Hidrante, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!window.confirm(`Remover o hidrante ${h.numero} de ${nomeUnidade}? Esta ação não pode ser desfeita.`)) return;
    setRemovendoId(h.id);
    try {
      await hidrantesApi.remover(h.id);
      toast(`Hidrante ${h.numero} removido.`, "sucesso");
      setHidrantes((prev) => prev.filter((x) => x.id !== h.id));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao remover hidrante.", "erro");
    } finally {
      setRemovendoId(null);
    }
  }

  async function carregar() {
    setCarregando(true);
    try {
      const r = await hidrantesApi.hidrantes(nomeUnidade);
      setHidrantes(r.hidrantes);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar hidrantes.", "erro");
    } finally {
      setCarregando(false);
    }
  }

  async function verificar(h: Hidrante) {
    setVerificando(h.id);
    try {
      const atualizado = await hidrantesApi.verificar(h.id, true);
      setHidrantes((xs) => xs.map((x) => (x.id === h.id ? { ...x, ...atualizado } : x)));
      toast("Marcado como verificado.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao verificar.", "erro");
    } finally {
      setVerificando(null);
    }
  }

  const contagens = hidrantes.reduce<Record<string, number>>((acc, h) => {
    acc[h.status_inspecao] = (acc[h.status_inspecao] ?? 0) + 1;
    return acc;
  }, {});

  const visivel = hidrantes.filter((h) => {
    if (filtroStatus !== "todos" && h.status_inspecao !== filtroStatus) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      if (!h.numero.toLowerCase().includes(q) &&
          !(h.setor ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <Link to="/hidrantes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Unidades
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-gray-400" />
            <h1 className="page-title">{nomeUnidade}</h1>
          </div>
          <button onClick={abrirNovo} className="btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" /> Novo hidrante
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{hidrantes.length} hidrantes · clique para ver detalhes, editar e verificar.</p>
      </div>

      {/* search + status filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input className="input pl-9" placeholder="Buscar nº, setor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTROS_STATUS.map(({ key, label }) => {
          const count = key === "todos" ? hidrantes.length : (contagens[key] ?? 0);
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
          <p className="text-sm text-gray-400">Nenhum hidrante encontrado para os filtros aplicados.</p>
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
                    <th className="table-th">Situação</th>
                    <th className="table-th">Verificação</th>
                    <th className="table-th w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {visivel.map((h) => {
                    const sit = h.situacao ?? "indeterminado";
                    const meta = SITUACAO_META[sit];
                    const st = STATUS_META[h.status_inspecao];
                    const critico = sit === "atencao";
                    return (
                      <tr key={h.id} onClick={() => navigate(`/hidrantes/${h.id}`)}
                        className={`table-row cursor-pointer ${meta.rowClass} ${meta.borderClass}`}>
                        <td className={`table-td font-bold ${critico ? "text-red-700" : "text-gray-900"}`}>{h.numero}</td>
                        <td className="table-td text-gray-500">{h.setor || "—"}</td>
                        <td className="table-td"><span className={meta.badgeClass}><meta.Icon className="w-3 h-3" />{meta.label}</span></td>
                        <td className="table-td">
                          {h.status_inspecao === "aguardando_verificacao" ? (
                            <button
                              onClick={(ev) => { ev.stopPropagation(); void verificar(h); }}
                              disabled={verificando === h.id}
                              className="btn-primary btn-sm"
                            >
                              {verificando === h.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Verificar
                            </button>
                          ) : (
                            <span className={st.cls}><st.Icon className="w-3 h-3" />{st.label}</span>
                          )}
                        </td>
                        <td className="table-td">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(ev) => removerHidrante(h, ev)}
                              disabled={removendoId === h.id}
                              title="Remover hidrante"
                              className="btn-ghost btn-sm text-red-600 hover:text-red-700 p-1"
                            >
                              {removendoId === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
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
              {visivel.length} hidrante{visivel.length !== 1 ? "s" : ""}{visivel.length < hidrantes.length && ` (de ${hidrantes.length} total)`}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {visivel.map((h) => {
              const sit = h.situacao ?? "indeterminado";
              const meta = SITUACAO_META[sit];
              const st = STATUS_META[h.status_inspecao];
              return (
                <div key={h.id} onClick={() => navigate(`/hidrantes/${h.id}`)}
                  className={`w-full text-left card p-4 flex items-start gap-3 cursor-pointer ${meta.rowClass} ${meta.borderClass}`}>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">Hidrante {h.numero}</span>
                      <span className={meta.badgeClass}><meta.Icon className="w-3 h-3" />{meta.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                      {h.setor && <span>{h.setor}</span>}
                    </div>
                    <span className={`${st.cls} text-[10px]`}><st.Icon className="w-3 h-3" />{st.label}</span>
                  </div>
                  <button
                    onClick={(ev) => removerHidrante(h, ev)}
                    disabled={removendoId === h.id}
                    title="Remover hidrante"
                    className="btn-ghost btn-sm text-red-600 hover:text-red-700 p-1 shrink-0"
                  >
                    {removendoId === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Add-hydrant modal */}
      <Modal open={modalNovo} titulo={`Novo hidrante — ${nomeUnidade}`} onClose={() => { if (!salvando) setModalNovo(false); }} largura="max-w-md">
        <div className="space-y-4">
          <p className="text-xs text-gray-400">
            Adicione um hidrante manualmente (instalado posteriormente ou correção do cadastro). Os itens do checklist são preenchidos depois, na inspeção.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Número (interno) *</label>
              <input className="input" type="number" min={1} value={form.numero_int}
                onChange={(ev) => setForm((f) => ({ ...f, numero_int: ev.target.value }))} placeholder="auto" />
            </div>
            <div>
              <label className="label">Rótulo exibido</label>
              <input className="input" value={form.numero}
                onChange={(ev) => setForm((f) => ({ ...f, numero: ev.target.value }))} placeholder="Ex.: H01 ou H11-2" />
            </div>
            <div className="col-span-2">
              <label className="label">Setor</label>
              <input className="input" value={form.setor} onChange={(ev) => setForm((f) => ({ ...f, setor: ev.target.value }))} placeholder="Ex.: Entrada Fábrica" />
            </div>
            <div>
              <label className="label">Esguichos</label>
              <input className="input" value={form.esguicho} onChange={(ev) => setForm((f) => ({ ...f, esguicho: ev.target.value }))} placeholder="Ex.: 2" />
            </div>
            <div>
              <label className="label">Mangueiras</label>
              <input className="input" value={form.mangueira} onChange={(ev) => setForm((f) => ({ ...f, mangueira: ev.target.value }))} placeholder="Ex.: 4" />
            </div>
            <div className="col-span-2">
              <label className="label">Chaves Storz</label>
              <input className="input" value={form.chave_storz} onChange={(ev) => setForm((f) => ({ ...f, chave_storz: ev.target.value }))} placeholder="Ex.: 2" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => setModalNovo(false)} disabled={salvando} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={criarHidrante} disabled={salvando} className="btn-primary flex-1">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
