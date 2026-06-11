import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

type Tipo = "sucesso" | "erro" | "info";

interface ToastMsg {
  id: number;
  mensagem: string;
  tipo: Tipo;
}

let _add: ((msg: string, tipo: Tipo) => void) | null = null;

export function toast(mensagem: string, tipo: Tipo = "sucesso") {
  _add?.(mensagem, tipo);
}

const CONFIG: Record<Tipo, { bg: string; text: string; Icon: React.ElementType }> = {
  sucesso: { bg: "bg-white border-green-200", text: "text-green-700", Icon: CheckCircle },
  erro:    { bg: "bg-white border-red-200",   text: "text-red-700",   Icon: XCircle   },
  info:    { bg: "bg-white border-blue-200",  text: "text-blue-700",  Icon: Info       },
};

export function ToastContainer() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    _add = (mensagem, tipo) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, mensagem, tipo }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4500);
    };
    return () => { _add = null; };
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none"
    >
      {items.map((t) => {
        const { bg, text, Icon } = CONFIG[t.tipo];
        return (
          <div
            key={t.id}
            className={`${bg} pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3.5 shadow-modal animate-toast-in`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${text}`} />
            <p className="flex-1 text-sm font-medium text-gray-800">{t.mensagem}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
