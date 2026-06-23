import { useLocation, useNavigate } from "react-router-dom";
import { Droplets, FileText, Search } from "lucide-react";
import { HidrantesPage } from "./HidrantesPage";
import { FichasHidrantePage } from "./FichasHidrantePage";
import { BuscaHidrantePage } from "./BuscaHidrantePage";

// Fase 3 hub — the hydrant functions navigated by tabs, mirroring the Fase 1
// hub (extintores) so all phases read the same way. Each tab is a distinct URL
// the sidebar links into:
//   /hidrantes        → Inventário (unidades)
//   /hidrantes/fichas → Fichas
//   /hidrantes/busca  → Busca / Relatórios
const ABAS = [
  { path: "/hidrantes",        label: "Inventário",         Icon: Droplets },
  { path: "/hidrantes/fichas", label: "Fichas",             Icon: FileText },
  { path: "/hidrantes/busca",  label: "Busca / Relatórios", Icon: Search },
];

export function HidrantesHubPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const ativo = location.pathname;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold tracking-wide text-sky-600 uppercase">Fase 3 · Hidrantes</p>
        <h1 className="text-xl font-bold text-gray-900 mt-0.5">Gestão de hidrantes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Inventário por unidade, fichas mensais de inspeção e relatórios.
        </p>
      </header>

      {/* Tab bar */}
      <div className="border-b border-gray-200 -mx-1 overflow-x-auto">
        <div className="flex gap-1 px-1 min-w-max">
          {ABAS.map(({ path, label, Icon }) => {
            const isAtivo = ativo === path;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isAtivo
                    ? "border-sky-600 text-sky-700"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active panel */}
      <div>
        {ativo === "/hidrantes/fichas" ? (
          <FichasHidrantePage embedded />
        ) : ativo === "/hidrantes/busca" ? (
          <BuscaHidrantePage embedded />
        ) : (
          <HidrantesPage embedded />
        )}
      </div>
    </div>
  );
}
