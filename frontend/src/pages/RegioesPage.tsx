import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { regioesApi } from "../lib/api";
import type { RegiaoProgresso, CicloAtivo } from "../lib/types";
import { useAuth } from "../hooks/useAuth";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { MapPin, ArrowRight, Loader2, CalendarDays, RefreshCw, PlusCircle, ShieldCheck, Clock, Circle } from "lucide-react";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
function mesAtual(): string {
  const d = new Date();
  return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
}

export function RegioesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";

  const [regioes, setRegioes] = useState<RegiaoProgresso[]>([]);
  const [ciclo, setCiclo]     = useState<CicloAtivo | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [modalMes, setModalMes] = useState(false);
  const [mes, setMes]           = useState(mesAtual);
  const [processando, setProcessando] = useState(false);

  useEffect(() => { void carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await regioesApi.listar();
      setRegioes(r.regioes);
      setCiclo(r.ciclo);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar regiões.", "erro");
    } finally {
      setCarregando(false);
    }
  }

  async function semear() {
    setProcessando(true);
    try {
      const r = await regioesApi.seed();
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
      await regioesApi.novoMes(mes);
      toast(`Novo ciclo iniciado: ${mes}. Todos os extintores foram redefinidos.`, "sucesso");
      setModalMes(false);
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao iniciar novo mês.", "erro");
    } finally {
      setProcessando(false);
    }
  }

  const totalEsperado = regioes.reduce((s, r) => s + r.total_esperado, 0);
  const totalVerificado = regioes.reduce((s, r) => s + r.verificado, 0);
  const totalAguardando = regioes.reduce((s, r) => s + r.aguardando_verificacao, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {!embedded && <h1 className="page-title">Extintores</h1>}
          <p className="text-sm text-gray-500 mt-0.5">
            Inventário de extintores por região e progresso da inspeção mensal.
          </p>
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
            {totalEsperado} extintores no total · {totalVerificado} verificados · {totalAguardando} aguardando verificação
          </p>
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-8 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : regioes.length === 0 ? (
        <div className="card p-12 text-center border-dashed">
          <p className="text-sm font-medium text-gray-500">Nenhuma região configurada.</p>
          {isOwner && <p className="text-xs text-gray-400 mt-1">Clique em "Gerar inventário" para criar os extintores.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {regioes.map((r) => (
            <Link key={r.nome} to={`/regioes/${encodeURIComponent(r.nome)}`} className="card-hover p-5 group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{r.nome}</p>
                  <p className="text-xs text-gray-400">{r.total_esperado} extintores</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-600 transition-colors" />
              </div>

              {/* progress bar */}
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
                <div className="bg-green-500 h-full" style={{ width: `${r.pct_verificado}%` }} />
                <div className="bg-amber-400 h-full" style={{ width: `${Math.max(0, r.pct_inspecionado - r.pct_verificado)}%` }} />
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-xs">
                <span className="flex items-center gap-1 text-green-700"><ShieldCheck className="w-3.5 h-3.5" /> {r.verificado} verificados</span>
                <span className="flex items-center gap-1 text-amber-600"><Clock className="w-3.5 h-3.5" /> {r.aguardando_verificacao} aguardando</span>
                <span className="flex items-center gap-1 text-gray-400"><Circle className="w-3.5 h-3.5" /> {r.nao_inspecionado} não inspecionados</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New month modal */}
      <Modal open={modalMes} titulo="Iniciar novo mês de inspeção" onClose={() => { if (!processando) setModalMes(false); }} largura="max-w-md">
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            Isto arquiva o ciclo atual e <strong>redefine TODOS os extintores</strong> para "não inspecionado".
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
