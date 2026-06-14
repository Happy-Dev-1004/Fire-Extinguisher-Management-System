import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { regioesApi, relatorioApi } from "../lib/api";
import type { ExtintorRegiao, StatusInspecao } from "../lib/types";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import {
  ArrowLeft, Loader2, ShieldCheck, Clock, Circle, Pencil, Check, Search, X, Download,
} from "lucide-react";

const STATUS_META: Record<StatusInspecao, { label: string; cls: string; Icon: typeof Circle }> = {
  verificado:             { label: "Verificado",            cls: "bg-green-100 text-green-700", Icon: ShieldCheck },
  aguardando_verificacao: { label: "Aguardando verificação", cls: "bg-amber-100 text-amber-700", Icon: Clock },
  nao_inspecionado:       { label: "Não inspecionado",       cls: "bg-gray-100 text-gray-500",   Icon: Circle },
};

const ITENS: Array<{ key: keyof ExtintorRegiao; label: string }> = [
  { key: "tipo_carga", label: "Tipo de carga" },
  { key: "capacidade", label: "Capacidade" },
  { key: "vencimento_carga", label: "Venc. carga" },
  { key: "vencimento_teste", label: "Venc. teste" },
  { key: "lacre", label: "Lacre" },
  { key: "manometro", label: "Manômetro" },
  { key: "sinalizacao_parede", label: "Sinalização parede" },
  { key: "sinalizacao_piso", label: "Sinalização piso" },
  { key: "suporte", label: "Suporte" },
  { key: "mangueira", label: "Mangueira" },
  { key: "quadro_instrucao", label: "Quadro de instrução" },
  { key: "setor", label: "Setor" },
  { key: "inspetor", label: "Inspetor" },
  { key: "status_geral", label: "Status geral" },
  { key: "observacoes", label: "Observações" },
];

const FILTROS: Array<{ key: "todos" | StatusInspecao; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "aguardando_verificacao", label: "Aguardando" },
  { key: "verificado", label: "Verificados" },
  { key: "nao_inspecionado", label: "Não inspecionados" },
];

export function RegiaoDetailPage() {
  const { regiao = "" } = useParams();
  const nomeRegiao = decodeURIComponent(regiao);

  const [extintores, setExtintores] = useState<ExtintorRegiao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | StatusInspecao>("todos");
  const [busca, setBusca]   = useState("");

  const [editando, setEditando] = useState<ExtintorRegiao | null>(null);
  const [form, setForm]         = useState<Partial<ExtintorRegiao>>({});
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState(false);

  async function baixarRelatorio(formato: "pdf" | "csv") {
    setBaixando(true);
    try {
      await relatorioApi.regiao(nomeRegiao, formato);
      toast("Relatório baixado.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao baixar relatório.", "erro");
    } finally {
      setBaixando(false);
    }
  }

  useEffect(() => { void carregar(); }, [regiao]);

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

  async function verificar(e: ExtintorRegiao, valor: boolean) {
    try {
      const atualizado = await regioesApi.verificar(e.id, valor);
      setExtintores((lista) => lista.map((x) => (x.id === e.id ? { ...x, ...atualizado } : x)));
      toast(valor ? "Marcado como verificado." : "Verificação removida.", "sucesso");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao verificar.", "erro");
    }
  }

  function abrirEdicao(e: ExtintorRegiao) {
    setEditando(e);
    setForm({ ...e });
  }

  async function salvarEdicao() {
    if (!editando) return;
    setSalvando(true);
    try {
      const campos: Partial<ExtintorRegiao> = {};
      for (const { key } of ITENS) (campos as any)[key] = (form as any)[key] ?? "";
      const atualizado = await regioesApi.editar(editando.id, campos);
      setExtintores((lista) => lista.map((x) => (x.id === editando.id ? { ...x, ...atualizado } : x)));
      toast("Extintor atualizado.", "sucesso");
      setEditando(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  const visiveis = extintores.filter((e) => {
    if (filtro !== "todos" && e.status_inspecao !== filtro) return false;
    if (busca.trim() && !e.numero.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <Link to="/regioes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="w-4 h-4" /> Regiões
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="page-title">{nomeRegiao}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{extintores.length} extintores · revise e verifique cada um.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => baixarRelatorio("pdf")} disabled={baixando} className="btn-secondary btn-sm">
              {baixando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PDF
            </button>
            <button onClick={() => baixarRelatorio("csv")} disabled={baixando} className="btn-secondary btn-sm">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className={`btn-sm ${filtro === f.key ? "btn-primary" : "btn-secondary"}`}>
            {f.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº do extintor"
            className="input pl-9 py-1.5 text-sm w-40" />
        </div>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {visiveis.map((e) => {
            const meta = STATUS_META[e.status_inspecao];
            return (
              <div key={e.id} className="card p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">Nº {e.numero}</span>
                  <button onClick={() => abrirEdicao(e)} className="text-gray-400 hover:text-brand-600" title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full w-fit ${meta.cls}`}>
                  <meta.Icon className="w-3 h-3" /> {meta.label}
                </span>
                {e.status_inspecao === "aguardando_verificacao" && (
                  <button onClick={() => verificar(e, true)} className="btn-primary btn-sm w-full mt-0.5">
                    <Check className="w-3.5 h-3.5" /> Verificar
                  </button>
                )}
                {e.status_inspecao === "verificado" && (
                  <button onClick={() => verificar(e, false)} className="btn-secondary btn-sm w-full mt-0.5">
                    <X className="w-3.5 h-3.5" /> Desfazer
                  </button>
                )}
              </div>
            );
          })}
          {visiveis.length === 0 && (
            <p className="col-span-full text-sm text-gray-400 py-6 text-center">Nenhum extintor neste filtro.</p>
          )}
        </div>
      )}

      {/* edit modal */}
      <Modal open={!!editando} titulo={`Editar extintor Nº ${editando?.numero ?? ""} — ${nomeRegiao}`}
        onClose={() => { if (!salvando) setEditando(null); }} largura="max-w-lg">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {ITENS.map(({ key, label }) => (
            <div key={key as string}>
              <label className="label">{label}</label>
              <input className="input" value={(form as any)[key] ?? ""}
                onChange={(ev) => setForm((f) => ({ ...f, [key]: ev.target.value }))} />
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-4">
          <button onClick={() => setEditando(null)} disabled={salvando} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={salvarEdicao} disabled={salvando} className="btn-primary flex-1">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
          </button>
        </div>
      </Modal>
    </div>
  );
}
