import { useEffect, useState, useCallback } from "react";
import { rdosApi, type RdoRow } from "../lib/api";
import { downscaleToBase64 } from "../lib/foto";
import { toast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { RdoEnviarModal } from "../components/RdoEnviarModal";
import {
  FileText, Camera, Send, Loader2, FileDown, Download, Eye, Trash2, ImagePlus, X,
} from "lucide-react";

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// RDO timeline tab: list of daily reports. Each row: preview (inline PDF), manage
// photos (add/delete), download PDF, send, and delete (soft). Filters by status.
export function AlarmeRdosPanel() {
  const [rdos, setRdos] = useState<RdoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviar, setEnviar] = useState<RdoRow | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [preview, setPreview] = useState<RdoRow | null>(null);
  const [fotos, setFotos] = useState<RdoRow | null>(null);
  const [excluir, setExcluir] = useState<RdoRow | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    rdosApi.listar(status ? { status } : undefined)
      .then((r) => setRdos(r.rdos))
      .catch((err) => toast(err instanceof Error ? err.message : "Erro ao carregar RDOs.", "erro"))
      .finally(() => setCarregando(false));
  }, [status]);
  useEffect(() => carregar(), [carregar]);

  const baixarPdf = async (r: RdoRow) => {
    setBaixando(r.id);
    try { await rdosApi.baixarPdf(r.id, r.data); }
    catch (err) { toast(err instanceof Error ? err.message : "Erro ao gerar PDF.", "erro"); }
    finally { setBaixando(null); }
  };

  const exportarLista = async (formato: "pdf" | "csv") => {
    try { await rdosApi.relatorio(status ? { status } : {}, formato); }
    catch (err) { toast(err instanceof Error ? err.message : "Erro ao exportar.", "erro"); }
  };

  const confirmarExcluir = async () => {
    if (!excluir) return;
    try {
      await rdosApi.excluir(excluir.id);
      toast("RDO excluído.", "sucesso");
      setRdos((prev) => prev.filter((x) => x.id !== excluir.id));
      setExcluir(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao excluir RDO.", "erro");
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-bold text-gray-900">Relatórios diários de obra (RDO)</h2>
        <select className="input text-xs ml-2 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="concluido">Concluído</option>
          <option value="em_andamento">Em andamento</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button onClick={() => exportarLista("pdf")} className="btn-ghost text-xs"><FileDown className="w-3.5 h-3.5 mr-1" />PDF</button>
          <button onClick={() => exportarLista("csv")} className="btn-ghost text-xs"><Download className="w-3.5 h-3.5 mr-1" />CSV</button>
        </div>
      </div>

      {carregando ? (
        <div className="py-8 text-center text-gray-400"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
      ) : rdos.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">Nenhum RDO registrado ainda.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rdos.map((r) => {
            const totalDisp = r.dispositivos_instalados
              ? Object.values(r.dispositivos_instalados).reduce((s, n) => s + (Number(n) || 0), 0) : 0;
            return (
              <li key={r.id} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{dataBR(r.data)}</span>
                    <span className={`badge ${r.status === "concluido" ? "badge-green" : r.status === "cancelado" ? "badge-gray" : "badge-brand"}`}>
                      {r.status ?? "—"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {r.responsavel ?? "—"}{r.central ? ` · ${r.central}` : ""}{r.frente_trabalho ? ` · ${r.frente_trabalho}` : ""}
                    {" · "}{totalDisp} disp. · {(r.fotos_dia ?? []).length} foto(s)
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPreview(r)} className="btn-ghost text-xs" title="Pré-visualizar">
                    <Eye className="w-3.5 h-3.5 mr-1" /> Prévia
                  </button>
                  <button onClick={() => setFotos(r)} className="btn-ghost text-xs" title="Gerenciar fotos do dia">
                    <Camera className="w-3.5 h-3.5 mr-1" /> Fotos
                  </button>
                  <button onClick={() => baixarPdf(r)} className="btn-ghost text-xs" disabled={baixando === r.id} title="Baixar PDF">
                    {baixando === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><FileText className="w-3.5 h-3.5 mr-1" />PDF</>}
                  </button>
                  <button onClick={() => setEnviar(r)} className="btn-secondary text-xs" title="Enviar">
                    <Send className="w-3.5 h-3.5 mr-1" /> Enviar
                  </button>
                  <button onClick={() => setExcluir(r)} className="btn-icon w-8 h-8 hover:bg-red-50 hover:text-red-600" title="Excluir RDO">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {enviar && <RdoEnviarModal rdo={enviar} onClose={() => setEnviar(null)} />}
      {preview && <RdoPreviewModal rdo={preview} onClose={() => setPreview(null)} />}
      {fotos && (
        <RdoFotosModal
          rdo={fotos}
          onClose={() => setFotos(null)}
          onChange={(atualizado) => {
            setRdos((prev) => prev.map((x) => (x.id === atualizado.id ? { ...x, ...atualizado } : x)));
            setFotos(atualizado);
          }}
        />
      )}
      {excluir && (
        <Modal open titulo="Excluir RDO" onClose={() => setExcluir(null)} largura="max-w-sm">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Excluir o RDO de <strong>{dataBR(excluir.data)}</strong>? Ele será removido das listas
            (mantido no histórico para auditoria).
          </p>
          <div className="flex gap-3 pt-4">
            <button onClick={() => setExcluir(null)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={confirmarExcluir} className="btn-danger flex-1"><Trash2 className="w-4 h-4" /> Excluir</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Inline PDF preview (light, photoless) ──────────────────────────────────────
function RdoPreviewModal({ rdo, onClose }: { rdo: RdoRow; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    rdosApi.preview(rdo.id)
      .then((u) => { revoke = u; setUrl(u); })
      .catch(() => setErro(true));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [rdo.id]);

  return (
    <Modal open titulo={`Prévia do RDO — ${dataBR(rdo.data)}`} onClose={onClose} largura="max-w-3xl">
      <div className="h-[70vh] rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
        {erro ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">Não foi possível gerar a prévia.</div>
        ) : url ? (
          <iframe src={url} title="Prévia do RDO" className="w-full h-full" />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">A prévia é leve (sem fotos). Use “PDF” na lista para a versão completa.</p>
    </Modal>
  );
}

// ── Manage RDO day-photos (add / delete) ───────────────────────────────────────
function RdoFotosModal({
  rdo, onClose, onChange,
}: { rdo: RdoRow; onClose: () => void; onChange: (r: RdoRow) => void }) {
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fotos = rdo.fotos_dia ?? [];

  const adicionar = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEnviando(true);
    try {
      const base64s = await Promise.all(Array.from(files).slice(0, 10).map(downscaleToBase64));
      const atualizado = await rdosApi.adicionarFotos(rdo.id, base64s.filter(Boolean) as string[]);
      onChange(atualizado);
      toast("Fotos adicionadas.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao adicionar fotos.", "erro");
    } finally {
      setEnviando(false);
    }
  };

  const remover = async (url: string) => {
    setRemovendo(url);
    try {
      const atualizado = await rdosApi.removerFoto(rdo.id, url);
      onChange(atualizado);
      toast("Foto removida.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao remover foto.", "erro");
    } finally {
      setRemovendo(null);
    }
  };

  return (
    <Modal open titulo={`Fotos do dia — ${dataBR(rdo.data)}`} onClose={onClose} largura="max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="section-title flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Fotos ({fotos.length})</p>
        <label className={`btn-secondary btn-sm cursor-pointer ${enviando ? "opacity-60 pointer-events-none" : ""}`}>
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          Adicionar fotos
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { void adicionar(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      {fotos.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">Nenhuma foto. Use “Adicionar fotos”.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto">
          {fotos.map((url, i) => (
            <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
              <button onClick={() => setLightbox(url)} className="block w-full h-full">
                <img src={url} alt={`Foto ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
              </button>
              <button
                onClick={() => remover(url)}
                disabled={removendo === url}
                title="Remover foto"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {removendo === url ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/80" onClick={() => setLightbox(null)}><X className="w-7 h-7" /></button>
          <img src={lightbox} alt="Foto" className="max-w-full max-h-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Modal>
  );
}
