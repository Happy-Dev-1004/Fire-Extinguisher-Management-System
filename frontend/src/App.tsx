import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { LoginPage } from "./pages/LoginPage";
import { Shell } from "./components/Shell";
import { DashboardPage } from "./pages/DashboardPage";
import { ExtintoresPage } from "./pages/ExtintoresPage";
import { ConfiguracoesPage } from "./pages/ConfiguracoesPage";
import { EquipePage } from "./pages/EquipePage";
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
              <Route path="/extintores" element={<ExtintoresPage />} />

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
