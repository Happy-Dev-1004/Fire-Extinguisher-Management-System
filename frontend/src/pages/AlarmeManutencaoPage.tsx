import { useEffect, useState, useCallback } from "react";
import {
  alarmeApi, ETAPAS_MANUTENCAO,
  type VisitaManutencao, type SituacaoManutencao, type StatusEtapa, type Central,
} from "../lib/api";
import { downscaleToBase64 } from "../lib/foto";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import {
  Wrench, Plus, Loader2, FileText, Eye, X, Trash2, Pencil,
  CheckCircle2, AlertTriangle, HelpCircle, ShieldCheck, Camera, ImagePlus,
} from "lucide-react";

const SIT_META: Record<SituacaoManutencao, { label: string; badge: string; Icon: React.ElementType }> = {
  atencao:       { label: "Não-conformidade", badge: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",       Icon: AlertTriangle },
  ok:            { label: "OK",               badge: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300", Icon: CheckCircle2 },
  indeterminado: { label: "Incompleta",       badge: "bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-300",   Icon: HelpCircle },
};
const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", aguardando_verificacao: "Aguardando verificação", verificado: "Verificado",
};
const ETAPA_OPCOES: { v: StatusEtapa; l: string }[] = [
  { v: "", l: "—" }, { v: "OK", l: "OK" }, { v: "NC", l: "NC" }, { v: "N.A", l: "N.A" },
];

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function hojeInput(): string { return new Date().toISOString().slice(0, 10); }

type FormVisita = {
  central_id: string; data_visita: string; tecnicos: string; responsavel: string;
  etapas: Record<string, StatusEtapa>; obs: Record<string, string>;
  nao_conformidades: string; recomendacoes: string; observacoes: string;
};
function formVazio(centralId = ""): FormVisita {
  return {
    central_id: centralId, data_visita: hojeInput(), tecnicos: "", responsavel: "",
    etapas: {}, obs: {}, nao_conformidades: "", recomendacoes: "", observacoes: "",
  };
}

export function AlarmeManutencaoPage() {
  const [visitas, setVisitas] = useState<VisitaManutencao[]>([]);
  const [centrais, setCentrais] = useState<Central[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormVisita>(formVazio());
  const [salvando, setSalvando] = useState(false);
  const [acaoId, setAcaoId] = useState<string | null>(null);

  // Photos of the visit being edited
  const [fotos, setFotos] = useState<string[]>([]);
  const [enviandoFotos, setEnviandoFotos] = useState(false);

  // PDF preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewando, setPreviewando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await alarmeApi.manutencaoListar();
      setVisitas(r.visitas);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar visitas.", "erro");
    } finally { setCarregando(false); }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { alarmeApi.centrais().then((r) => setCentrais(r.centrais)).catch(() => {}); }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function abrirNova() {
    setEditId(null);
    setForm(formVazio(centrais[0]?.id ?? ""));
    setFotos([]);
    setModal(true);
  }

  async function abrirEditar(v: VisitaManutencao) {
    setEditId(v.id);
    setForm({
      central_id: v.central_id,
      data_visita: v.data_visita ?? hojeInput(),
      tecnicos: v.tecnicos ?? "",
      responsavel: v.responsavel ?? "",
      etapas: Object.fromEntries(ETAPAS_MANUTENCAO.map((e) => [e.chave, (v[e.chave] as StatusEtapa) ?? ""])),
      obs: v.observacoes_etapas ?? {},
      nao_conformidades: v.nao_conformidades ?? "",
      recomendacoes: v.recomendacoes ?? "",
      observacoes: v.observacoes ?? "",
    });
    setFotos(v.fotos ?? []);
    setModal(true);
  }

  async function salvar() {
    if (!form.central_id) { toast("Selecione a central.", "erro"); return; }
    setSalvando(true);
    try {
      const body: any = {
        central_id: form.central_id,
        data_visita: form.data_visita || null,
        tecnicos: form.tecnicos.trim(),
        responsavel: form.responsavel.trim(),
        observacoes_etapas: form.obs,
        nao_conformidades: form.nao_conformidades.trim(),
        recomendacoes: form.recomendacoes.trim(),
        observacoes: form.observacoes.trim(),
      };
      for (const e of ETAPAS_MANUTENCAO) body[e.chave] = form.etapas[e.chave] ?? "";

      const salva = editId
        ? await alarmeApi.manutencaoEditar(editId, body)
        : await alarmeApi.manutencaoCriar(body);
      toast(editId ? "Visita atualizada." : "Visita registrada.", "sucesso");
      setEditId(salva.id); // so photo uploads target it
      await carregar();
      if (!editId) { /* keep modal open for photos on a fresh visit */ }
      else setModal(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar a visita.", "erro");
    } finally { setSalvando(false); }
  }

  async function anexarFotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!editId) { toast("Salve a visita primeiro para anexar fotos.", "info"); return; }
    setEnviandoFotos(true);
    try {
      const b64s: string[] = [];
      for (const f of Array.from(files).slice(0, 10)) {
        const b = await downscaleToBase64(f);
        if (b) b64s.push(b);
      }
      if (b64s.length === 0) { toast("Não foi possível processar as imagens.", "erro"); return; }
      const v = await alarmeApi.manutencaoAdicionarFotos(editId, b64s);
      setFotos(v.fotos);
      toast(`${b64s.length} foto(s) anexada(s).`, "sucesso");
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao anexar fotos.", "erro");
    } finally { setEnviandoFotos(false); }
  }

  async function removerFoto(url: string) {
    if (!editId) return;
    try {
      const v = await alarmeApi.manutencaoRemoverFoto(editId, url);
      setFotos(v.fotos);
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao remover foto.", "erro"); }
  }

  async function verificar(v: VisitaManutencao) {
    setAcaoId(v.id);
    try {
      await alarmeApi.manutencaoVerificar(v.id, v.status !== "verificado");
      toast(v.status !== "verificado" ? "Visita verificada." : "Verificação desfeita.", "sucesso");
      await carregar();
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao verificar.", "erro"); }
    finally { setAcaoId(null); }
  }

  async function remover(v: VisitaManutencao) {
    if (!window.confirm(`Remover a visita da Central ${v.central_numero ?? "?"} de ${fmtData(v.data_visita)}? Esta ação não pode ser desfeita.`)) return;
    setAcaoId(v.id);
    try {
      await alarmeApi.manutencaoRemover(v.id);
      setVisitas((prev) => prev.filter((x) => x.id !== v.id));
      toast("Visita removida.", "sucesso");
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao remover.", "erro"); }
    finally { setAcaoId(null); }
  }

  async function abrirPreview(v: VisitaManutencao) {
    setPreviewando(v.id);
    try {
      const url = await alarmeApi.manutencaoPreview(v.id);
      setPreviewUrl(url);
    } catch (e) { toast(e instanceof Error ? e.message : "Erro ao gerar PDF.", "erro"); }
    finally { setPreviewando(null); }
  }
  async function baixar(v: VisitaManutencao) {
    try { await alarmeApi.baixarManutencao(v.id, v.central_numero); toast("PDF baixado.", "sucesso"); }
    catch (e) { toast(e instanceof Error ? e.message : "Erro ao baixar PDF.", "erro"); }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-brand-600" /> Manutenção Preventiva
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registre as visitas preventivas do alarme (checklist de 7 etapas por central) e emita o relatório técnico.
          </p>
        </div>
        <button onClick={abrirNova} className="btn-primary btn-sm shrink-0">
          <Plus className="w-3.5 h-3.5" /> Nova visita
        </button>
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : visitas.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm">Nenhuma visita registrada. Clique em <strong>"Nova visita"</strong> para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visitas.map((v) => {
            const meta = SIT_META[v.situacao];
            return (
              <div key={v.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">Central {v.central_numero ?? "?"}</span>
                    <span className="text-xs text-gray-400">· {fmtData(v.data_visita)}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                      <meta.Icon className="w-3 h-3" /> {meta.label}
                    </span>
                    {v.status === "verificado" && <span className="badge-green"><ShieldCheck className="w-3 h-3" /> Verificado</span>}
                    {v.status === "rascunho" && <span className="badge-gray">{STATUS_LABEL.rascunho}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {v.tecnicos || "sem técnicos"}{v.fotos.length > 0 ? ` · ${v.fotos.length} foto(s)` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap">
                  <button onClick={() => abrirEditar(v)} className="btn-secondary btn-sm" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => abrirPreview(v)} disabled={previewando === v.id} className="btn-secondary btn-sm" title="Pré-visualizar PDF">
                    {previewando === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => baixar(v)} className="btn-secondary btn-sm" title="Baixar PDF"><FileText className="w-3.5 h-3.5" /></button>
                  {v.status !== "rascunho" && (
                    <button onClick={() => verificar(v)} disabled={acaoId === v.id} className={v.status === "verificado" ? "btn-secondary btn-sm" : "btn-primary btn-sm"} title={v.status === "verificado" ? "Desfazer verificação" : "Verificar"}>
                      {acaoId === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  <button onClick={() => remover(v)} disabled={acaoId === v.id} className="btn-ghost btn-sm text-red-600 hover:text-red-700 p-1.5" title="Remover"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New/edit visit modal */}
      <Modal open={modal} titulo={editId ? "Editar visita de manutenção" : "Nova visita de manutenção"} onClose={() => { if (!salvando) setModal(false); }} largura="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Central *</label>
              <select className="input" value={form.central_id} onChange={(e) => setForm((f) => ({ ...f, central_id: e.target.value }))}>
                <option value="">— selecione —</option>
                {centrais.map((c) => <option key={c.id} value={c.id}>Central {c.numero}{c.nome ? ` · ${c.nome}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Data da visita</label>
              <input type="date" className="input" value={form.data_visita} onChange={(e) => setForm((f) => ({ ...f, data_visita: e.target.value }))} />
            </div>
            <div>
              <label className="label">Técnicos</label>
              <input className="input" value={form.tecnicos} onChange={(e) => setForm((f) => ({ ...f, tecnicos: e.target.value }))} placeholder="Nomes dos técnicos" />
            </div>
            <div>
              <label className="label">Responsável</label>
              <input className="input" value={form.responsavel} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} />
            </div>
          </div>

          {/* 7-step checklist */}
          <div>
            <p className="section-title mb-2">Checklist da visita (7 etapas)</p>
            <div className="space-y-2">
              {ETAPAS_MANUTENCAO.map((et, i) => (
                <div key={et.chave} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-gray-100 rounded-lg p-2">
                  <span className="text-sm text-gray-700 flex-1 min-w-0"><span className="text-gray-400 mr-1">{i + 1}.</span>{et.rotulo}</span>
                  <select
                    className="input py-1 text-sm sm:w-24"
                    value={form.etapas[et.chave] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, etapas: { ...f.etapas, [et.chave]: e.target.value as StatusEtapa } }))}
                  >
                    {ETAPA_OPCOES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                  <input
                    className="input py-1 text-sm sm:w-56"
                    placeholder="Observação"
                    value={form.obs[et.chave] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, obs: { ...f.obs, [et.chave]: e.target.value } }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Closing blocks */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="label">Não-conformidades encontradas</label>
              <textarea className="input" rows={2} value={form.nao_conformidades} onChange={(e) => setForm((f) => ({ ...f, nao_conformidades: e.target.value }))} />
            </div>
            <div>
              <label className="label">Recomendações de correção</label>
              <textarea className="input" rows={2} value={form.recomendacoes} onChange={(e) => setForm((f) => ({ ...f, recomendacoes: e.target.value }))} />
            </div>
            <div>
              <label className="label">Observações gerais</label>
              <textarea className="input" rows={2} value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </div>

          {/* Photos (only after the visit exists) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="section-title">Registro fotográfico</p>
              <label className={`btn-secondary btn-sm cursor-pointer ${!editId ? "opacity-50 pointer-events-none" : ""}`}>
                {enviandoFotos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Adicionar fotos
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => anexarFotos(e.target.files)} />
              </label>
            </div>
            {!editId ? (
              <p className="text-xs text-gray-400">Salve a visita primeiro para anexar fotos.</p>
            ) : fotos.length === 0 ? (
              <p className="text-xs text-gray-400 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Nenhuma foto anexada.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {fotos.map((u) => (
                  <div key={u} className="relative group">
                    <img src={u} className="w-full h-20 object-cover rounded-lg border border-gray-200" />
                    <button onClick={() => removerFoto(u)} className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Remover">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={() => setModal(false)} disabled={salvando} className="btn-secondary flex-1">{editId ? "Fechar" : "Cancelar"}</button>
            <button onClick={salvar} disabled={salvando} className="btn-primary flex-1">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {editId ? "Salvar" : "Registrar visita"}
            </button>
          </div>
        </div>
      </Modal>

      {/* PDF preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col p-3 sm:p-6 animate-fade-in" onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>
          <div className="flex items-center justify-between mb-2 text-white">
            <p className="text-sm font-medium">Pré-visualização — Relatório de Manutenção</p>
            <button onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="btn-secondary btn-sm" onClickCapture={(e) => e.stopPropagation()}>
              <X className="w-3.5 h-3.5" /> Fechar
            </button>
          </div>
          <iframe title="Relatório de manutenção" src={previewUrl} className="flex-1 w-full rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
