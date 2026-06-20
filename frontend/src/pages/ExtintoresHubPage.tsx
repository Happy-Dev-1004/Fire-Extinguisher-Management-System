import { useLocation, useNavigate } from "react-router-dom";
import { Flame, FileText, Search } from "lucide-react";
import { RegioesPage } from "./RegioesPage";
import { FichasPage } from "./FichasPage";
import { BuscaPage } from "./BuscaPage";

// Fase 1 hub — the extinguisher functions navigated by tabs, mirroring the Fase
// 2 hub so both phases read the same way. Each tab is a distinct URL the sidebar
// links into:
//   /extintores → Inventário (regiões)
//   /fichas     → Fichas
//   /busca      → Busca / Relatórios
const ABAS = [
  { path: "/extintores", label: "Inventário",         Icon: Flame },
  { path: "/fichas",     label: "Fichas",             Icon: FileText },
  { path: "/busca",      label: "Busca / Relatórios", Icon: Search },
];

export function ExtintoresHubPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const ativo = location.pathname;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold tracking-wide text-orange-600 uppercase">Fase 1 · Extintores</p>
        <h1 className="text-xl font-bold text-gray-900 mt-0.5">Gestão de extintores</h1>
        <p className="text-sm text-gray-500 mt-1">
          Inventário por região, fichas mensais de inspeção e relatórios.
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
                    ? "border-orange-600 text-orange-700"
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
        {ativo === "/fichas" ? (
          <FichasPage embedded />
        ) : ativo === "/busca" ? (
          <BuscaPage embedded />
        ) : (
          <RegioesPage embedded />
        )}
      </div>
    </div>
  );
}
