import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { regioesApi, relatorioApi } from "../lib/api";
import type { ExtintorRegiao, StatusInspecao, Situacao as SituacaoType } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import {
  ArrowLeft, Flame, AlertTriangle, CheckCircle2, XCircle, Clock, HelpCircle,
  Camera, MapPin, ShieldCheck, Circle, Pencil, Check, Download, Loader2,
} from "lucide-react";

type Situacao = SituacaoType;

const SITUACAO_META: Record<Situacao, { label: string; badgeClass: string; Icon: React.ElementType }> = {
  vencido:       { label: "Vencido",         badgeClass: "badge-red",   Icon: XCircle },
  descartado:    { label: "Descartado",       badgeClass: "badge-red",   Icon: XCircle },
  proximo:       { label: "Próx. vencimento", badgeClass: "badge-amber", Icon: Clock },
  em_dia:        { label: "Em dia",           badgeClass: "badge-green", Icon: CheckCircle2 },
  indeterminado: { label: "Indeterminado",    badgeClass: "badge-gray",  Icon: HelpCircle },
};

const STATUS_META: Record<StatusInspecao, { label: string; cls: string; Icon: React.ElementType }> = {
  verificado:             { label: "Verificado",             cls: "badge-green", Icon: ShieldCheck },
  aguardando_verificacao: { label: "Aguardando verificação", cls: "badge-amber", Icon: Clock },
  nao_inspecionado:       { label: "Não inspecionado",       cls: "badge-gray",  Icon: Circle },
};

// Checklist + editable fields, in display order.
const CAMPOS: Array<{ key: keyof ExtintorRegiao; label: string; checklist?: boolean }> = [
  { key: "tipo_carga",        label: "Tipo / Carga" },
  { key: "capacidade",        label: "Capacidade" },
  { key: "setor",             label: "Setor" },
  { key: "vencimento_carga",  label: "Vencimento da carga" },
  { key: "vencimento_teste",  label: "Vencimento do teste" },
  { key: "inspetor",          label: "Inspetor" },
  { key: "lacre",             label: "Lacre", checklist: true },
  { key: "manometro",         label: "Manômetro", checklist: true },
  { key: "sinalizacao_parede",label: "Sinalização parede", checklist: true },
  { key: "sinalizacao_piso",  label: "Sinalização piso", checklist: true },
  { key: "suporte",           label: "Suporte / Abrigo", checklist: true },
  { key: "mangueira",         label: "Mangueira", checklist: true },
  { key: "quadro_instrucao",  label: "Quadro de instrução", checklist: true },
  { key: "status_geral",      label: "Status geral" },
  { key: "observacoes",       label: "Observações" },
];

function CheckBadge({ valor }: { valor: string | null }) {
  const ok = valor === "OK", reprov = valor === "Reprovado";
  const cls = ok ? "badge-green" : reprov ? "badge-red" : "badge-gray";
  return <span className={cls}>{ok && <CheckCircle2 className="w-3 h-3" />}{reprov && <XCircle className="w-3 h-3" />}{valor ?? "—"}</span>;
}

export function ExtintorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ext, setExt]               = useState<ExtintorRegiao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]             = useState("");
  const [dlPdf, setDlPdf]           = useState(false);

  const [editando, setEditando] = useState(false);
  const [form, setForm]         = useState<Partial<ExtintorRegiao>>({});
  const [salvando, setSalvando] = useState(false);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void (async () => {
      setCarregando(true); setErro("");
      try {
        const e = await regioesApi.obter(id);
        if (active) setExt(e);
      } catch (e) {
        if (active) setErro(e instanceof Error ? e.message : "Erro ao carregar extintor.");
      } finally {
        if (active) setCarregando(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  async function verificar(valor: boolean) {
    if (!ext) return;
    setVerificando(true);
    try {
      const atualizado = await regioesApi.verificar(ext.id, valor);
      setExt((x) => x ? { ...x, ...atualizado } : x);
      toast(valor ? "Marcado como verificado." : "Verificação removida.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao verificar.", "erro");
    } finally {
      setVerificando(false);
    }
  }

  function abrirEdicao() {
    if (!ext) return;
    setForm({ ...ext });
    setEditando(true);
  }

  async function salvar() {
    if (!ext) return;
    setSalvando(true);
    try {
      const campos: Partial<ExtintorRegiao> = {};
      for (const { key } of CAMPOS) (campos as any)[key] = (form as any)[key] ?? "";
      const atualizado = await regioesApi.editar(ext.id, campos);
      setExt((x) => x ? { ...x, ...atualizado } : x);
      toast("Extintor atualizado.", "sucesso");
      setEditando(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar.", "erro");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="skeleton h-7 w-40" />
        <div className="card p-6 space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-4 w-full" />)}</div>
      </div>
    );
  }
  if (erro || !ext) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={() => navigate(-1)} className="btn-ghost btn-sm"><ArrowLeft className="w-4 h-4" /> Voltar</button>
        <div className="card p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{erro || "Extintor não encontrado."}</p>
        </div>
      </div>
    );
  }

  const situacao = ext.situacao ?? "indeterminado";
  const sm = SITUACAO_META[situacao];
  const st = STATUS_META[ext.status_inspecao];
  const inspecionado = ext.status_inspecao !== "nao_inspecionado";

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <button onClick={() => navigate(`/regioes/${encodeURIComponent(ext.regiao)}`)} className="btn-ghost btn-sm -ml-1">
        <ArrowLeft className="w-4 h-4" /> {ext.regiao}
      </button>

      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="page-title">Extintor {ext.numero}</h1>
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />{ext.regiao}{ext.setor && <> · {ext.setor}</>}
            </div>
          </div>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 flex-wrap">
          <span className={`${st.cls} text-sm px-3 py-1`}><st.Icon className="w-3.5 h-3.5" />{st.label}</span>
          <span className={`${sm.badgeClass} text-sm px-3 py-1`}><sm.Icon className="w-3.5 h-3.5" />{sm.label}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={abrirEdicao} className="btn-secondary btn-sm"><Pencil className="w-3.5 h-3.5" /> Editar valores</button>
        {ext.status_inspecao === "aguardando_verificacao" && (
          <button onClick={() => verificar(true)} disabled={verificando} className="btn-primary btn-sm">
            {verificando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Verificação concluída
          </button>
        )}
        {ext.status_inspecao === "verificado" && (
          <button onClick={() => verificar(false)} disabled={verificando} className="btn-secondary btn-sm">
            {verificando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Desfazer verificação
          </button>
        )}
        <button onClick={async () => { setDlPdf(true); try { await relatorioApi.extintor(ext.id, ext.regiao, ext.numero); } catch {/* */} finally { setDlPdf(false); } }}
          disabled={dlPdf} className="btn-secondary btn-sm">
          {dlPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PDF
        </button>
      </div>

      {/* Identity */}
      <div className="card p-5">
        <p className="section-title mb-4">Identificação</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoCell label="Número" value={ext.numero} />
          <InfoCell label="Região" value={ext.regiao} />
          <InfoCell label="Setor" value={ext.setor || "—"} />
          <InfoCell label="Tipo / Carga" value={ext.tipo_carga || "—"} />
          <InfoCell label="Capacidade" value={ext.capacidade || "—"} />
          <InfoCell label="Inspetor" value={ext.inspetor || "—"} />
        </div>
        <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-2 gap-4">
          <div><p className="text-xs text-gray-400 mb-0.5">Vencimento da carga</p><p className="text-lg font-semibold text-gray-900">{ext.vencimento_carga || <span className="text-gray-300 text-sm">Não informado</span>}</p></div>
          <div><p className="text-xs text-gray-400 mb-0.5">Vencimento do teste</p><p className="text-lg font-semibold text-gray-900">{ext.vencimento_teste || <span className="text-gray-300 text-sm">Não informado</span>}</p></div>
        </div>
      </div>

      {/* Checklist */}
      {inspecionado ? (
        <div className="card p-5">
          <p className="section-title mb-3">Checklist da inspeção</p>
          <div className="divide-y divide-gray-100">
            {CAMPOS.filter((c) => c.checklist).map(({ key, label }) => (
              <div key={key as string} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-gray-700">{label}</span>
                <CheckBadge valor={(ext[key] as string | null) ?? null} />
              </div>
            ))}
          </div>
          {ext.status_geral && <div className="mt-4 pt-4 border-t border-gray-100"><p className="section-title mb-1">Status geral</p><p className="text-sm text-gray-700">{ext.status_geral}</p></div>}
          {ext.observacoes && <div className="mt-4 pt-4 border-t border-gray-100"><p className="section-title mb-1">Observações</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{ext.observacoes}</p></div>}
          {ext.fotos?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="section-title mb-3"><Camera className="w-3.5 h-3.5 inline mr-1" />Fotos ({ext.fotos.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ext.fotos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90">
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 right-1 bg-black/40 rounded text-white text-[10px] px-1">{i + 1}</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card p-8 text-center border-dashed">
          <Circle className="w-9 h-9 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Este extintor ainda não foi inspecionado neste ciclo.</p>
          <p className="text-xs text-gray-300 mt-1">Os valores aparecem após o inspetor enviar as fotos, ou edite manualmente.</p>
        </div>
      )}

      {/* Edit modal */}
      <Modal open={editando} titulo={`Editar extintor Nº ${ext.numero} — ${ext.regiao}`} onClose={() => { if (!salvando) setEditando(false); }} largura="max-w-lg">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {CAMPOS.map(({ key, label }) => (
            <div key={key as string}>
              <label className="label">{label}</label>
              <input className="input" value={(form as any)[key] ?? ""} onChange={(ev) => setForm((f) => ({ ...f, [key]: ev.target.value }))} />
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-4">
          <button onClick={() => setEditando(false)} disabled={salvando} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="btn-primary flex-1">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar
          </button>
        </div>
      </Modal>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-gray-400 mb-0.5">{label}</p><p className="text-sm font-semibold text-gray-900">{value}</p></div>;
}
