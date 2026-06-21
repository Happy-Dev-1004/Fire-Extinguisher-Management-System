import { useEffect, useState } from "react";
import { notificacoesApi, type SaudeSistema } from "../lib/api";
import { Activity, Cpu, MessageCircle, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

// Owner-only "Saúde do sistema" card: OpenAI token consumption vs the monthly
// limit, and Z-API connection + renewal countdown. Lets the owner check the
// services' status at any time (and pairs with the proactive alerts).
export function SaudeCard() {
  const [s, setS] = useState<SaudeSistema | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    notificacoesApi.saude()
      .then(setS)
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return <div className="card p-5 flex items-center gap-2 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Verificando saúde do sistema…</div>;
  }
  if (erro || !s) return null; // silently hide if unavailable (e.g. not owner)

  const pct = s.openai.pct;
  const openaiBar = pct >= 100 ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-green-500";
  const zapiDias = s.zapi.dias_para_renovar;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Activity className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </span>
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Saúde do sistema</h2>
        <span className="ml-auto text-[11px] text-gray-400">somente proprietário</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* OpenAI */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">OpenAI</span>
            {s.openai.ultima_falha
              ? <span className="badge-red ml-auto"><XCircle className="w-3 h-3" /> Falha recente</span>
              : <span className="badge-green ml-auto"><CheckCircle2 className="w-3 h-3" /> OK</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div className={`h-full ${openaiBar}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-300 w-10 text-right">{pct}%</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            {s.openai.tokens_mes.toLocaleString("pt-BR")} / {s.openai.limite_mes.toLocaleString("pt-BR")} tokens este mês
          </p>
        </div>

        {/* Z-API */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">WhatsApp (Z-API)</span>
            {s.zapi.ultima_falha
              ? <span className="badge-red ml-auto"><XCircle className="w-3 h-3" /> Falha recente</span>
              : s.zapi.conectado === false
              ? <span className="badge-amber ml-auto"><AlertTriangle className="w-3 h-3" /> Desconectado</span>
              : s.zapi.conectado === true
              ? <span className="badge-green ml-auto"><CheckCircle2 className="w-3 h-3" /> Conectado</span>
              : <span className="badge-gray ml-auto">Status indisponível</span>}
          </div>
          {s.zapi.renova_em ? (
            <p className={`text-xs ${zapiDias != null && zapiDias <= 7 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-gray-600 dark:text-gray-300"}`}>
              {zapiDias != null && zapiDias <= 0
                ? "Assinatura vencida — renove para não interromper o WhatsApp."
                : `Renova em ${zapiDias} dia(s) (${s.zapi.renova_em}).`}
            </p>
          ) : (
            <p className="text-[11px] text-gray-400">
              Informe a data de renovação em Configurações para receber avisos antecipados.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
