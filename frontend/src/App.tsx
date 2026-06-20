import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { Shell } from "./components/Shell";
import { DashboardPage } from "./pages/DashboardPage";
import { ExtintorDetailPage } from "./pages/ExtintorDetailPage";
import { ConfiguracoesPage } from "./pages/ConfiguracoesPage";
import { EquipePage } from "./pages/EquipePage";
import { InspetoresPage } from "./pages/InspetoresPage";
import { DestinatariosPage } from "./pages/DestinatariosPage";
import { RegiaoDetailPage } from "./pages/RegiaoDetailPage";
import { AjudaPage } from "./pages/AjudaPage";
import { ExtintoresHubPage } from "./pages/ExtintoresHubPage";
import { AlarmeHubPage } from "./pages/AlarmeHubPage";
import { RequireAuth } from "./components/RequireAuth";
import { RequireOwner } from "./components/RequireOwner";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* All dashboard routes require a valid session */}
          <Route element={<RequireAuth />}>
            <Route element={<Shell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              {/* Fase 1 hub — tabs (Inventário / Fichas / Busca) keyed by path.
                  Deep detail pages stay standalone (region detail, extinguisher detail). */}
              <Route path="/extintores" element={<ExtintoresHubPage />} />
              <Route path="/fichas" element={<ExtintoresHubPage />} />
              <Route path="/busca" element={<ExtintoresHubPage />} />
              <Route path="/regioes/:regiao" element={<RegiaoDetailPage />} />
              <Route path="/extintores/:id" element={<ExtintorDetailPage />} />
              <Route path="/inspetores" element={<InspetoresPage />} />
              <Route path="/destinatarios" element={<DestinatariosPage />} />
              {/* Fase 2 hub — tabs (Progresso / Registro fotográfico / RDOs) keyed by path */}
              <Route path="/alarme" element={<AlarmeHubPage />} />
              <Route path="/alarme/fotos" element={<AlarmeHubPage />} />
              <Route path="/alarme/rdos" element={<AlarmeHubPage />} />
              <Route path="/ajuda" element={<AjudaPage />} />

              {/* Owner-only routes — backend also enforces 403 */}
              <Route element={<RequireOwner />}>
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                <Route path="/equipe" element={<EquipePage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
