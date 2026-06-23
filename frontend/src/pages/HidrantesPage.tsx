import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { hidrantesApi, unidadesHidranteApi } from "../lib/api";
import type { UnidadeHidranteProgresso, UnidadeHidrante, CicloAtivo } from "../lib/types";
import { useAuth } from "../hooks/useAuth";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { Droplets, ArrowRight, Loader2, CalendarDays, RefreshCw, PlusCircle, ShieldCheck, Clock, Circle, Settings2, Trash2, Plus } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
function mesAtual(): string {
  const d = new Date();
  return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
}

export function HidrantesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";

  const [unidades, setUnidades] = useState<UnidadeHidranteProgresso[]>([]);
  const [ciclo, setCiclo]       = useState<CicloAtivo | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [modalMes, setModalMes] = useState(false);
  const [mes, setMes]           = useState(mesAtual);
  const [processando, setProcessando] = useState(false);

  // Owner-managed unit registry
  const [unidadesReg, setUnidadesReg] = useState<UnidadeHidrante[]>([]);
  const [novoNome, setNovoNome]   = useState("");
  const [novoTotal, setNovoTotal] = useState("");
  const [salvandoUnidade, setSalvandoUnidade] = useState(false);
  const [removendoUnidade, setRemovendoUnidade] = useState<string | null>(null);

  useEffect(() => { void carregar(); }, []);
  useEffect(() => { if (isOwner) void carregarUnidades(); }, [isOwner]);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await hidrantesApi.listar();
      setUnidades(r.unidades);
      setCiclo(r.ciclo);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar unidades.", "erro");
    } finally {
      setCarregando(false);
    }
  }

  async function carregarUnidades() {
    try {
      const r = await unidadesHidranteApi.listar();
      setUnidadesReg(r.unidades);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar registro de unidades.", "erro");
    }
  }

  async function criarUnidade() {
    const nome = novoNome.trim();
    const total = parseInt(novoTotal, 10);
    if (!nome || !Number.isFinite(total) || total <= 0) {
      toast("Informe o nome e a quantidade de hidrantes.", "erro");
      return;
    }
    setSalvandoUnidade(true);
    try {
      await unidadesHidranteApi.criar({ nome, total_hidrantes: total });
      toast(`Unidade "${nome}" criada.`, "sucesso");
      setNovoNome(""); setNovoTotal("");
      await carregarUnidades();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao criar unidade.", "erro");
    } finally {
      setSalvandoUnidade(false);
    }
  }

  async function removerUnidade(u: UnidadeHidrante) {
    if (!window.confirm(`Remover a unidade "${u.nome}"? Esta ação não pode ser desfeita.`)) return;
    setRemovendoUnidade(u.id);
    try {
      await unidadesHidranteApi.remover(u.id);
      toast(`Unidade "${u.nome}" removida.`, "sucesso");
      await carregarUnidades();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao remover unidade.", "erro");
    } finally {
      setRemovendoUnidade(null);
    }
  }

  async function semear() {
    setProcessando(true);
    try {
      const r = await hidrantesApi.seed();
      toast(`Inventário criado: ${r.inseridos} novo(s) slot(s).`, "sucesso");
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao semear inventário.", "erro");
    } finally {
      setProcessando(false);
    }
  }

  async function iniciarNovoMes() {
    setProcessando(true);
    try {
      await hidrantesApi.novoMes(mes);
      toast(`Novo ciclo iniciado: ${mes}. Todos os hidrantes foram redefinidos.`, "sucesso");
      setModalMes(false);
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao iniciar novo mês.", "erro");
    } finally {
      setProcessando(false);
    }
  }

  const totalEsperado = unidades.reduce((s, u) => s + u.total_esperado, 0);
  const totalVerificado = unidades.reduce((s, u) => s + u.verificado, 0);
  const totalAguardando = unidades.reduce((s, u) => s + u.aguardando_verificacao, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {!embedded && (
            <>
              <h1 className="page-title">Hidrantes</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Inventário de hidrantes por unidade e progresso da inspeção mensal.
              </p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={carregar} className="btn-secondary btn-sm" disabled={carregando}>
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar
          </button>
          {isOwner && (
            <>
              <button onClick={semear} className="btn-secondary btn-sm" disabled={processando}>
                <PlusCircle className="w-3.5 h-3.5" /> Gerar inventário
              </button>
              <button onClick={() => { setMes(mesAtual()); setModalMes(true); }} className="btn-primary btn-sm" disabled={processando}>
                <CalendarDays className="w-3.5 h-3.5" /> Iniciar novo mês
              </button>
            </>
          )}
        </div>
      </div>

      {/* Owner: unit registry management */}
      {isOwner && (
        <div className="card p-5">
          <p className="section-title flex items-center gap-1.5 mb-3">
            <Settings2 className="w-3.5 h-3.5" /> Unidades
          </p>
          <p className="text-xs text-gray-400 mb-4">
            Defina as unidades e a quantidade de hidrantes antes de gerar o inventário.
          </p>

          {unidadesReg.length > 0 && (
            <div className="divide-y divide-gray-100 mb-4">
              {unidadesReg.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{u.nome}</p>
                    <p className="text-xs text-gray-400">{u.total_hidrantes} hidrantes</p>
                  </div>
                  <button
                    onClick={() => removerUnidade(u)}
                    disabled={removendoUnidade === u.id}
                    title="Remover unidade"
                    className="btn-ghost btn-sm text-red-600 hover:text-red-700"
                  >
                    {removendoUnidade === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="Nome da unidade"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
            />
            <input
              className="input sm:w-40"
              type="number"
              min={1}
              placeholder="Nº de hidrantes"
              value={novoTotal}
              onChange={(e) => setNovoTotal(e.target.value)}
            />
            <button onClick={criarUnidade} disabled={salvandoUnidade} className="btn-primary btn-sm">
              {salvandoUnidade ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Adicionar
            </button>
          </div>
        </div>
      )}

      {/* Cycle + totals banner */}
      <div className="card p-4 flex flex-wrap items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <CalendarDays className="w-5 h-5 text-brand-600" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm font-semibold text-gray-900">
            Ciclo atual: {ciclo?.mes_referencia ?? "—"}
          </p>
          <p className="text-xs text-gray-400">
            {totalEsperado} hidrantes no total · {totalVerificado} verificados · {totalAguardando} aguardando verificação
          </p>
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-8 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : unidades.length === 0 ? (
        <div className="card p-12 text-center border-dashed">
          <p className="text-sm font-medium text-gray-500">Nenhuma unidade configurada.</p>
          {isOwner && <p className="text-xs text-gray-400 mt-1">Cadastre as unidades acima e clique em "Gerar inventário" para criar os hidrantes.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {unidades.map((u) => (
            <Link key={u.nome} to={`/hidrantes/unidade/${encodeURIComponent(u.nome)}`} className="card-hover p-5 group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Droplets className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{u.nome}</p>
                  <p className="text-xs text-gray-400">{u.total_esperado} hidrantes</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-600 transition-colors" />
              </div>

              {/* progress bar */}
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
                <div className="bg-green-500 h-full" style={{ width: `${u.pct_verificado}%` }} />
                <div className="bg-amber-400 h-full" style={{ width: `${Math.max(0, u.pct_inspecionado - u.pct_verificado)}%` }} />
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-xs">
                <span className="flex items-center gap-1 text-green-700"><ShieldCheck className="w-3.5 h-3.5" /> {u.verificado} verificados</span>
                <span className="flex items-center gap-1 text-amber-600"><Clock className="w-3.5 h-3.5" /> {u.aguardando_verificacao} aguardando</span>
                <span className="flex items-center gap-1 text-gray-400"><Circle className="w-3.5 h-3.5" /> {u.nao_inspecionado} não inspecionados</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New month modal */}
      <Modal open={modalMes} titulo="Iniciar novo mês de inspeção" onClose={() => { if (!processando) setModalMes(false); }} largura="max-w-md">
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            Isto arquiva o ciclo atual e <strong>redefine TODOS os hidrantes</strong> para "não inspecionado".
            Os valores do mês anterior são preservados no histórico. Esta ação é do proprietário.
          </div>
          <div>
            <label className="label">Mês de referência do novo ciclo</label>
            <input className="input" value={mes} onChange={(e) => setMes(e.target.value)} placeholder="Ex: Julho/2026" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setModalMes(false)} disabled={processando} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={iniciarNovoMes} disabled={processando || !mes.trim()} className="btn-primary flex-1">
              {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />} Iniciar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
