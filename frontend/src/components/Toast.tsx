import { useEffect, useState } from "react";

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

export function ToastContainer() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    _add = (mensagem, tipo) => {
      const id = Date.now();
      setItems((prev) => [...prev, { id, mensagem, tipo }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
    };
    return () => { _add = null; };
  }, []);

  const colors: Record<Tipo, string> = {
    sucesso: "bg-green-600",
    erro:    "bg-red-600",
    info:    "bg-blue-600",
  };

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`${colors[t.tipo]} text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg animate-fade-in`}
        >
          {t.mensagem}
        </div>
      ))}
    </div>
  );
}
