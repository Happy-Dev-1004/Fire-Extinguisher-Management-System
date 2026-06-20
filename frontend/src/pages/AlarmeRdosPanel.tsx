import { useEffect, useState, useCallback } from "react";
import { rdosApi, type RdoRow } from "../lib/api";
import { toast } from "../components/Toast";
import { RdoEnviarModal } from "../components/RdoEnviarModal";
import { FileText, Camera, Send, Loader2, FileDown, Download } from "lucide-react";

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// RDO timeline tab: list of daily reports, each linking to its PDF and its day's
// photo record, with send + list export. Filters by status and month.
export function AlarmeRdosPanel() {
  const [rdos, setRdos] = useState<RdoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviar, setEnviar] = useState<RdoRow | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

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
              <li key={r.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
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
                <div className="flex items-center gap-2">
                  <a
                    href={`/alarme/fotos?data=${encodeURIComponent(r.data ?? "")}`}
                    className="btn-ghost text-xs"
                    title="Registro fotográfico do dia"
                  >
                    <Camera className="w-3.5 h-3.5 mr-1" /> Fotos
                  </a>
                  <button onClick={() => baixarPdf(r)} className="btn-ghost text-xs" disabled={baixando === r.id}>
                    {baixando === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><FileText className="w-3.5 h-3.5 mr-1" />PDF</>}
                  </button>
                  <button onClick={() => setEnviar(r)} className="btn-secondary text-xs">
                    <Send className="w-3.5 h-3.5 mr-1" /> Enviar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {enviar && <RdoEnviarModal rdo={enviar} onClose={() => setEnviar(null)} />}
    </div>
  );
}
