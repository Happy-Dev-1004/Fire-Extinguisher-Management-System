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
import { FichasPage } from "./pages/FichasPage";
import { BuscaPage } from "./pages/BuscaPage";
import { RegioesPage } from "./pages/RegioesPage";
import { RegiaoDetailPage } from "./pages/RegiaoDetailPage";
import { AjudaPage } from "./pages/AjudaPage";
import { AlarmeFotosPage } from "./pages/AlarmeFotosPage";
import { AlarmeProgressoPage } from "./pages/AlarmeProgressoPage";
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
              {/* Extintores = the regional inventory: region cards → region detail → extinguisher detail */}
              <Route path="/extintores" element={<RegioesPage />} />
              <Route path="/regioes/:regiao" element={<RegiaoDetailPage />} />
              <Route path="/extintores/:id" element={<ExtintorDetailPage />} />
              <Route path="/inspetores" element={<InspetoresPage />} />
              <Route path="/destinatarios" element={<DestinatariosPage />} />
              <Route path="/fichas" element={<FichasPage />} />
              <Route path="/busca" element={<BuscaPage />} />
              <Route path="/alarme/progresso" element={<AlarmeProgressoPage />} />
              <Route path="/alarme/fotos" element={<AlarmeFotosPage />} />
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
