import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { hidrantesApi } from "../lib/api";
import { downscaleToBase64 } from "../lib/foto";
import type { Hidrante, StatusInspecao, SituacaoHidrante } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import {
  ArrowLeft, Droplets, AlertTriangle, CheckCircle2, XCircle, Clock, HelpCircle,
  Camera, MapPin, ShieldCheck, Circle, Pencil, Check, Loader2,
  ImagePlus, Trash2,
} from "lucide-react";

const SITUACAO_META: Record<SituacaoHidrante, { label: string; badgeClass: string; Icon: React.ElementType }> = {
  atencao:       { label: "Atenção",       badgeClass: "badge-red",   Icon: AlertTriangle },
  pendente:      { label: "Pendente",      badgeClass: "badge-amber", Icon: Clock },
  ok:            { label: "OK",            badgeClass: "badge-green", Icon: CheckCircle2 },
  indeterminado: { label: "Indeterminado", badgeClass: "badge-gray",  Icon: HelpCircle },
};

const STATUS_META: Record<StatusInspecao, { label: string; cls: string; Icon: React.ElementType }> = {
  verificado:             { label: "Verificado",             cls: "badge-green", Icon: ShieldCheck },
  aguardando_verificacao: { label: "Aguardando verificação", cls: "badge-amber", Icon: Clock },
  nao_inspecionado:       { label: "Não inspecionado",       cls: "badge-gray",  Icon: Circle },
};

// Checklist (4-state) items, in display order.
const CHECKLIST: Array<{ key: keyof Hidrante; label: string }> = [
  { key: "c_esguicho",            label: "Esguicho" },
  { key: "c_condicoes_caixa",     label: "Condições da caixa" },
  { key: "c_condicoes_acesso",    label: "Condições de acesso" },
  { key: "c_identificacao_piso",  label: "Identificação (Piso)" },
  { key: "c_identificacao_placa", label: "Identificação (Placa)" },
  { key: "c_mangueira",           label: "Mangueira" },
  { key: "c_adaptador",           label: "Adaptador" },
  { key: "c_chave_storz",         label: "Chave Storz" },
  { key: "c_teste",               label: "Teste" },
  { key: "c_tampa_hidrante",      label: "Tampa Hidrante" },
];

// Editable constants + general fields.
const CAMPOS_EXTRA: Array<{ key: keyof Hidrante; label: string }> = [
  { key: "setor",        label: "Setor" },
  { key: "esguicho",     label: "Esguicho (constante)" },
  { key: "mangueira",    label: "Mangueira (constante)" },
  { key: "chave_storz",  label: "Chave Storz (constante)" },
  { key: "status_geral", label: "Status geral" },
  { key: "observacoes",  label: "Observações" },
];

function CheckBadge({ valor }: { valor: string | null }) {
  const ok = valor === "OK", reprov = valor === "Reprovado";
  const cls = ok ? "badge-green" : reprov ? "badge-red" : "badge-gray";
  return <span className={cls}>{ok && <CheckCircle2 className="w-3 h-3" />}{reprov && <XCircle className="w-3 h-3" />}{valor ?? "—"}</span>;
}

export function HidranteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [hid, setHid]               = useState<Hidrante | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]             = useState("");

  const [editando, setEditando] = useState(false);
  const [form, setForm]         = useState<Partial<Hidrante>>({});
  const [salvando, setSalvando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  async function adicionarFotos(files: FileList | null) {
    if (!hid || !files || files.length === 0) return;
    setEnviandoFotos(true);
    try {
      const base64s = await Promise.all(Array.from(files).slice(0, 10).map(downscaleToBase64));
      const atualizado = await hidrantesApi.adicionarFotos(hid.id, base64s.filter(Boolean) as string[]);
      setHid((x) => x ? { ...x, ...atualizado } : x);
      toast("Fotos adicionadas.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao adicionar fotos.", "erro");
    } finally {
      setEnviandoFotos(false);
    }
  }

  async function removerFoto(url: string) {
    if (!hid) return;
    setRemovendo(url);
    try {
      const atualizado = await hidrantesApi.removerFoto(hid.id, url);
      setHid((x) => x ? { ...x, ...atualizado } : x);
      toast("Foto removida.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao remover foto.", "erro");
    } finally {
      setRemovendo(null);
    }
  }

  useEffect(() => {
    if (!id) return;
    let active = true;
    void (async () => {
      setCarregando(true); setErro("");
      try {
        const h = await hidrantesApi.obter(id);
        if (active) setHid(h);
      } catch (e) {
        if (active) setErro(e instanceof Error ? e.message : "Erro ao carregar hidrante.");
      } finally {
        if (active) setCarregando(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  async function verificar(valor: boolean) {
    if (!hid) return;
    setVerificando(true);
    try {
      const atualizado = await hidrantesApi.verificar(hid.id, valor);
      setHid((x) => x ? { ...x, ...atualizado } : x);
      toast(valor ? "Marcado como verificado." : "Verificação removida.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao verificar.", "erro");
    } finally {
      setVerificando(false);
    }
  }

  function abrirEdicao() {
    if (!hid) return;
    setForm({ ...hid });
    setEditando(true);
  }

  async function salvar() {
    if (!hid) return;
    setSalvando(true);
    try {
      const campos: Partial<Hidrante> = {};
      for (const { key } of [...CHECKLIST, ...CAMPOS_EXTRA]) (campos as any)[key] = (form as any)[key] ?? "";
      const atualizado = await hidrantesApi.editar(hid.id, campos);
      setHid((x) => x ? { ...x, ...atualizado } : x);
      toast("Hidrante atualizado.", "sucesso");
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
  if (erro || !hid) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={() => navigate(-1)} className="btn-ghost btn-sm"><ArrowLeft className="w-4 h-4" /> Voltar</button>
        <div className="card p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{erro || "Hidrante não encontrado."}</p>
        </div>
      </div>
    );
  }

  const situacao = hid.situacao ?? "indeterminado";
  const sm = SITUACAO_META[situacao];
  const st = STATUS_META[hid.status_inspecao];
  const inspecionado = hid.status_inspecao !== "nao_inspecionado";

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <button onClick={() => navigate(`/hidrantes/unidade/${encodeURIComponent(hid.unidade)}`)} className="btn-ghost btn-sm -ml-1">
        <ArrowLeft className="w-4 h-4" /> {hid.unidade}
      </button>

      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <Droplets className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="page-title">Hidrante {hid.numero}</h1>
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5">
              <MapPin className="w-3.5 h-3.5" />{hid.unidade}{hid.setor && <> · {hid.setor}</>}
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
        {hid.status_inspecao === "aguardando_verificacao" && (
          <button onClick={() => verificar(true)} disabled={verificando} className="btn-primary btn-sm">
            {verificando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Verificação concluída
          </button>
        )}
        {hid.status_inspecao === "verificado" && (
          <button onClick={() => verificar(false)} disabled={verificando} className="btn-secondary btn-sm">
            {verificando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Desfazer verificação
          </button>
        )}
      </div>

      {/* Identity */}
      <div className="card p-5">
        <p className="section-title mb-4">Identificação</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoCell label="Número" value={hid.numero} />
          <InfoCell label="Unidade" value={hid.unidade} />
          <InfoCell label="Setor" value={hid.setor || "—"} />
          <InfoCell label="Esguicho" value={hid.esguicho || "—"} />
          <InfoCell label="Mangueira" value={hid.mangueira || "—"} />
          <InfoCell label="Chave Storz" value={hid.chave_storz || "—"} />
          <InfoCell label="Inspetor" value={hid.inspetor || "—"} />
        </div>
      </div>

      {/* Checklist */}
      {inspecionado ? (
        <div className="card p-5">
          <p className="section-title mb-3">Checklist da inspeção</p>
          <div className="divide-y divide-gray-100">
            {CHECKLIST.map(({ key, label }) => (
              <div key={key as string} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-sm text-gray-700">{label}</span>
                <CheckBadge valor={(hid[key] as string | null) ?? null} />
              </div>
            ))}
          </div>
          {hid.status_geral && <div className="mt-4 pt-4 border-t border-gray-100"><p className="section-title mb-1">Status geral</p><p className="text-sm text-gray-700">{hid.status_geral}</p></div>}
          {hid.observacoes && <div className="mt-4 pt-4 border-t border-gray-100"><p className="section-title mb-1">Observações</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{hid.observacoes}</p></div>}
        </div>
      ) : (
        <div className="card p-8 text-center border-dashed">
          <Circle className="w-9 h-9 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Este hidrante ainda não foi inspecionado neste ciclo.</p>
          <p className="text-xs text-gray-300 mt-1">Os valores aparecem após o inspetor enviar as fotos, ou adicione manualmente abaixo.</p>
        </div>
      )}

      {/* Photos card — always available, with manual upload + remove */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="section-title flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" /> Fotos {hid.fotos?.length ? `(${hid.fotos.length})` : ""}
          </p>
          <label className={`btn-secondary btn-sm cursor-pointer ${enviandoFotos ? "opacity-60 pointer-events-none" : ""}`}>
            {enviandoFotos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            Adicionar fotos
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { void adicionarFotos(e.target.files); e.target.value = ""; }} />
          </label>
        </div>

        {hid.fotos?.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {hid.fotos.map((url, i) => (
              <div key={url + i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full hover:opacity-90">
                  <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                </a>
                <div className="absolute bottom-1 right-1 bg-black/40 rounded text-white text-[10px] px-1">{i + 1}</div>
                <button
                  onClick={() => removerFoto(url)}
                  disabled={removendo === url}
                  title="Remover foto"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {removendo === url ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-2">Nenhuma foto. Use "Adicionar fotos" para enviar manualmente.</p>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={editando} titulo={`Editar hidrante Nº ${hid.numero} — ${hid.unidade}`} onClose={() => { if (!salvando) setEditando(false); }} largura="max-w-lg">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {[...CHECKLIST, ...CAMPOS_EXTRA].map(({ key, label }) => (
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
