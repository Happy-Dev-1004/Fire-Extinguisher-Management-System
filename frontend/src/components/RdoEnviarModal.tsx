import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { toast } from "./Toast";
import { rdosApi, type RdoRow } from "../lib/api";
import type { DestinatarioResolvido } from "../lib/types";
import { Loader2, Mail, MessageCircle, Send, CheckCircle2, XCircle } from "lucide-react";

type Canal = "ambos" | "whatsapp" | "email";

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Confirmation modal: previews who will receive the RDO, lets the user pick the
// channel, sends, and reports per-recipient outcome (no silent failure).
export function RdoEnviarModal({ rdo, onClose }: { rdo: RdoRow; onClose: () => void }) {
  const [destinatarios, setDestinatarios] = useState<DestinatarioResolvido[] | null>(null);
  const [canal, setCanal] = useState<Canal>("ambos");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ mensagem: string; detalhes: any[] } | null>(null);

  useEffect(() => {
    rdosApi.destinatarios()
      .then((r) => setDestinatarios(r.destinatarios))
      .catch((err) => toast(err instanceof Error ? err.message : "Erro ao carregar destinatários.", "erro"));
  }, []);

  const enviar = async () => {
    setEnviando(true);
    setResultado(null);
    try {
      const r = await rdosApi.enviar(rdo.id, canal);
      setResultado({ mensagem: r.mensagem, detalhes: r.detalhes as any[] });
      toast(r.mensagem, r.falhas > 0 ? "info" : "sucesso");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Falha ao enviar o RDO.", "erro");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open titulo={`Enviar RDO — ${dataBR(rdo.data)}`} onClose={onClose}>
      <div className="space-y-4">
        {/* Channel picker */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Canal de envio</label>
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            {([
              { v: "ambos", l: "Ambos" },
              { v: "whatsapp", l: "WhatsApp" },
              { v: "email", l: "E-mail" },
            ] as { v: Canal; l: string }[]).map((c) => (
              <button
                key={c.v}
                onClick={() => setCanal(c.v)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  canal === c.v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {c.l}
              </button>
            ))}
          </div>
        </div>

        {/* Recipients preview */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">Destinatários (unidade RDO)</p>
          {destinatarios === null ? (
            <div className="py-4 text-center text-gray-400"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
          ) : destinatarios.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Nenhum destinatário configurado para RDO. Cadastre destinatários na unidade <strong>RDO</strong>
              {" "}(ou <strong>*</strong>) na página de Destinatários antes de enviar.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-44 overflow-y-auto">
              {destinatarios.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-800">{d.nome}</span>
                  {d.telefone_normalizado && <MessageCircle className="w-3.5 h-3.5 text-green-600" />}
                  {d.email && <Mail className="w-3.5 h-3.5 text-blue-600" />}
                  <span className="text-xs text-gray-400 truncate">{d.telefone || ""} {d.email ? `· ${d.email}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Result detail */}
        {resultado && (
          <div className="rounded-lg border border-gray-200 p-3 space-y-1.5">
            <p className="text-sm font-medium text-gray-800">{resultado.mensagem}</p>
            {resultado.detalhes.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="font-medium">{d.destinatario?.nome}</span>
                {d.whatsapp?.tentado && (
                  <span className="inline-flex items-center gap-0.5">
                    <MessageCircle className="w-3 h-3" />
                    {d.whatsapp.ok ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <XCircle className="w-3 h-3 text-red-500" />}
                  </span>
                )}
                {d.email?.tentado && (
                  <span className="inline-flex items-center gap-0.5">
                    <Mail className="w-3 h-3" />
                    {d.email.ok ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <XCircle className="w-3 h-3 text-red-500" />}
                  </span>
                )}
                {(d.whatsapp?.motivo || d.email?.motivo) && (
                  <span className="text-red-500 truncate">{d.whatsapp?.motivo || d.email?.motivo}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Fechar</button>
          <button
            onClick={enviar}
            className="btn-primary"
            disabled={enviando || destinatarios === null || destinatarios.length === 0}
          >
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1.5" /> Enviar agora</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
