import { useEffect, useRef, useState, useCallback } from "react";
import { notificacoesApi, type Notificacao } from "../lib/api";
import {
  Bell, X, CheckCheck, AlertTriangle, AlertCircle, CheckCircle2, Info,
  Activity, Camera, FileText, Wrench,
} from "lucide-react";

const POLL_MS = 45_000;

function dataHoraBR(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const SEV: Record<string, { cor: string; Icon: React.ElementType }> = {
  critico: { cor: "text-red-500",    Icon: AlertCircle },
  aviso:   { cor: "text-amber-500",  Icon: AlertTriangle },
  sucesso: { cor: "text-green-500",  Icon: CheckCircle2 },
  info:    { cor: "text-blue-500",   Icon: Info },
};
const TIPO_ICON: Record<string, React.ElementType> = {
  sessao: Activity, foto: Camera, instalacao: Wrench, rdo: FileText, saude: AlertCircle,
};

export function NotificationBell() {
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const painelRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await notificacoesApi.listar();
      setItens(r.notificacoes);
      setNaoLidas(r.nao_lidas);
    } catch { /* silent — bell must never break the page */ }
  }, []);

  // Poll on an interval + when the panel opens.
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, POLL_MS);
    return () => clearInterval(t);
  }, [carregar]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!aberto) return;
    const onClick = (e: MouseEvent) => {
      if (painelRef.current && !painelRef.current.contains(e.target as Node)) setAberto(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [aberto]);

  const abrir = () => { setAberto((v) => !v); if (!aberto) carregar(); };

  const marcarLida = async (id: string) => {
    setItens((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    setNaoLidas((n) => Math.max(0, n - 1));
    try { await notificacoesApi.marcarLida(id); } catch { /* */ }
  };
  const lerTodas = async () => {
    setItens((prev) => prev.map((n) => ({ ...n, lida: true })));
    setNaoLidas(0);
    try { await notificacoesApi.lerTodas(); } catch { /* */ }
  };

  return (
    <div className="relative" ref={painelRef}>
      <button onClick={abrir} className="btn-icon relative" aria-label="Notificações" title="Notificações">
        <Bell className="w-5 h-5" />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-modal z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Notificações</span>
            <div className="flex items-center gap-1">
              {naoLidas > 0 && (
                <button onClick={lerTodas} className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Ler todas
                </button>
              )}
              <button onClick={() => setAberto(false)} className="btn-icon w-7 h-7" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto">
            {itens.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma notificação.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {itens.map((n) => {
                  const sev = SEV[n.severidade] ?? SEV.info;
                  const TipoIcon = TIPO_ICON[n.tipo] ?? sev.Icon;
                  return (
                    <li
                      key={n.id}
                      onClick={() => !n.lida && marcarLida(n.id)}
                      className={`flex gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                        !n.lida ? "bg-brand-50/40 dark:bg-brand-500/5" : ""
                      }`}
                    >
                      <span className={`mt-0.5 shrink-0 ${sev.cor}`}><TipoIcon className="w-4 h-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${!n.lida ? "font-semibold" : "font-medium"} text-gray-900 dark:text-gray-100`}>
                          {n.titulo}
                          {n.contador > 1 && <span className="ml-1 text-xs text-gray-400">×{n.contador}</span>}
                        </p>
                        {n.mensagem && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{n.mensagem}</p>}
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{dataHoraBR(n.atualizado_em)}</p>
                      </div>
                      {!n.lida && <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-500 shrink-0" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
