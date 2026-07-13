import { useEffect, useState, useCallback } from "react";
import { alarmeApi, type AreaCronograma, type SituacaoCronograma } from "../lib/api";
import { toast } from "../components/Toast";
import {
  CalendarClock, Loader2, CheckCircle2, Clock, AlertTriangle, HelpCircle, Save,
  FileText, Download, Eye, X,
} from "lucide-react";

const SIT_META: Record<SituacaoCronograma, { label: string; badge: string; Icon: React.ElementType }> = {
  concluido: { label: "Concluído",   badge: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300", Icon: CheckCircle2 },
  no_prazo:  { label: "No prazo",    badge: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",     Icon: Clock },
  atrasado:  { label: "Atrasado",    badge: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",         Icon: AlertTriangle },
  sem_data:  { label: "Sem data",    badge: "bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-300",     Icon: HelpCircle },
};

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Fase 2 · Cronograma — execution schedule per área (central + setor): target
// delivery date + live install progress + on-track/late status.
export function AlarmeCronogramaPage() {
  const [areas, setAreas] = useState<AreaCronograma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null);
  // Local edits to the date inputs, keyed by central_id|setor.
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  // PDF export state
  const [baixando, setBaixando]     = useState(false);
  const [previewando, setPreviewando] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const keyDe = (a: AreaCronograma) => `${a.central_id}|${a.setor}`;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await alarmeApi.cronograma();
      setAreas(r.areas);
      setRascunho(Object.fromEntries(r.areas.map((a) => [keyDe(a), a.data_prevista ?? ""])));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar o cronograma.", "erro");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function baixarPDF() {
    setBaixando(true);
    try {
      await alarmeApi.baixarCronograma();
      toast("PDF do cronograma baixado.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao baixar o PDF.", "erro");
    } finally {
      setBaixando(false);
    }
  }

  async function abrirPreview() {
    setPreviewando(true);
    try {
      const url = await alarmeApi.cronogramaPreview();
      setPreviewUrl(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao gerar a pré-visualização.", "erro");
    } finally {
      setPreviewando(false);
    }
  }

  function fecharPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function salvar(a: AreaCronograma) {
    const k = keyDe(a);
    const nova = rascunho[k]?.trim() || null;
    setSalvandoKey(k);
    try {
      await alarmeApi.definirCronograma({ central_id: a.central_id, setor: a.setor, data_prevista: nova });
      toast(`Data de ${a.setor} atualizada.`, "sucesso");
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar a data.", "erro");
    } finally {
      setSalvandoKey(null);
    }
  }

  // Rollup counters for the header.
  const totalAreas = areas.length;
  const atrasadas = areas.filter((a) => a.situacao === "atrasado").length;
  const concluidas = areas.filter((a) => a.situacao === "concluido").length;

  // Group areas by central for readable sections.
  const porCentral = new Map<string, AreaCronograma[]>();
  for (const a of areas) {
    const label = `Central ${a.central_numero ?? "?"}${a.central_nome ? ` · ${a.central_nome}` : ""}`;
    (porCentral.get(label) ?? porCentral.set(label, []).get(label)!).push(a);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-brand-600" /> Cronograma de Execução
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Defina a data de entrega por área e acompanhe o andamento da instalação (entregue = testado).
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={abrirPreview} disabled={previewando || carregando} className="btn-secondary btn-sm" title="Pré-visualizar o PDF">
            {previewando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Pré-visualizar
          </button>
          <button onClick={baixarPDF} disabled={baixando || carregando} className="btn-primary btn-sm" title="Baixar o cronograma em PDF">
            {baixando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Baixar PDF
          </button>
        </div>
      </div>

      {/* Rollup */}
      {!carregando && totalAreas > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4"><p className="text-2xl font-bold text-gray-900">{totalAreas}</p><p className="text-xs text-gray-500">áreas</p></div>
          <div className="card p-4"><p className="text-2xl font-bold text-green-700">{concluidas}</p><p className="text-xs text-gray-500">concluídas</p></div>
          <div className="card p-4"><p className={`text-2xl font-bold ${atrasadas > 0 ? "text-red-700" : "text-gray-900"}`}>{atrasadas}</p><p className="text-xs text-gray-500">atrasadas</p></div>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : areas.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <CalendarClock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm">Nenhuma área encontrada. Cadastre/importe os dispositivos primeiro.</p>
        </div>
      ) : (
        Array.from(porCentral.entries()).map(([central, lista]) => (
          <div key={central} className="space-y-2">
            <p className="section-title">{central}</p>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-th">Área (setor)</th>
                      <th className="table-th">Progresso</th>
                      <th className="table-th whitespace-nowrap">Data de entrega</th>
                      <th className="table-th">Situação</th>
                      <th className="table-th w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((a) => {
                      const k = keyDe(a);
                      const meta = SIT_META[a.situacao];
                      const alterado = (rascunho[k] ?? "") !== (a.data_prevista ?? "");
                      return (
                        <tr key={k} className={`table-row ${a.situacao === "atrasado" ? "bg-red-50/60" : ""}`}>
                          <td className="table-td font-medium text-gray-800 max-w-[240px]">{a.setor || "—"}</td>
                          <td className="table-td min-w-[160px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: `${a.pct}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap">{a.concluidos}/{a.total}</span>
                            </div>
                          </td>
                          <td className="table-td">
                            <input
                              type="date"
                              className="input py-1 text-sm w-[150px]"
                              value={rascunho[k] ?? ""}
                              onChange={(e) => setRascunho((r) => ({ ...r, [k]: e.target.value }))}
                            />
                          </td>
                          <td className="table-td">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                              <meta.Icon className="w-3 h-3" /> {meta.label}
                            </span>
                            {a.data_prevista && a.situacao !== "concluido" && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">alvo: {fmtData(a.data_prevista)}</span>
                            )}
                          </td>
                          <td className="table-td">
                            {alterado && (
                              <button onClick={() => salvar(a)} disabled={salvandoKey === k} title="Salvar data" className="btn-primary btn-sm p-1.5">
                                {salvandoKey === k ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))
      )}

      {/* PDF preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col p-3 sm:p-6 animate-fade-in" onClick={fecharPreview}>
          <div className="flex items-center justify-between mb-2 text-white">
            <p className="text-sm font-medium">Pré-visualização — Cronograma de Execução</p>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={baixarPDF} className="btn-secondary btn-sm">
                <Download className="w-3.5 h-3.5" /> Baixar PDF
              </button>
              <button onClick={fecharPreview} className="btn-secondary btn-sm">
                <X className="w-3.5 h-3.5" /> Fechar
              </button>
            </div>
          </div>
          <iframe title="Pré-visualização do cronograma" src={previewUrl}
            className="flex-1 w-full rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
