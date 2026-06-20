import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Camera, FileText } from "lucide-react";
import { AlarmeProgressoPage } from "./AlarmeProgressoPage";
import { AlarmeFotosPage } from "./AlarmeFotosPage";
import { AlarmeRdosPanel } from "./AlarmeRdosPanel";

// Fase 2 hub — one page, the alarm functions navigated by tabs ("tags"), the
// same pattern validated in Phase 1's photo page. Each tab is reachable by a
// distinct URL so the sidebar can deep-link straight into it:
//   /alarme        → Progresso
//   /alarme/fotos  → Registro fotográfico
//   /alarme/rdos   → RDOs
const ABAS = [
  { path: "/alarme",       label: "Progresso",            Icon: Activity },
  { path: "/alarme/fotos", label: "Registro fotográfico", Icon: Camera },
  { path: "/alarme/rdos",  label: "RDOs",                 Icon: FileText },
];

export function AlarmeHubPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const ativo = location.pathname;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">Fase 2 · Alarme de incêndio</p>
        <h1 className="text-xl font-bold text-gray-900 mt-0.5">Sistema de alarme</h1>
        <p className="text-sm text-gray-500 mt-1">
          Progresso da instalação, registro fotográfico dos dispositivos e relatórios diários de obra.
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
                    ? "border-brand-600 text-brand-700"
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
        {ativo === "/alarme/fotos" ? (
          <AlarmeFotosPage embedded />
        ) : ativo === "/alarme/rdos" ? (
          <AlarmeRdosPanel />
        ) : (
          <AlarmeProgressoPage embedded />
        )}
      </div>
    </div>
  );
}
