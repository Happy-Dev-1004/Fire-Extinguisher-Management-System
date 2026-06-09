import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireOwner } from "./RequireOwner";

// Mock useAuth to control the role
vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../hooks/useAuth";
const mockUseAuth = vi.mocked(useAuth);

function renderWithRoute(role: "owner" | "member" | null) {
  mockUseAuth.mockReturnValue({
    profile: role ? { email: "test@test.com", nome: "Teste", role } : null,
    loading: false,
    session: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={["/configuracoes"]}>
      <Routes>
        <Route element={<RequireOwner />}>
          <Route path="/configuracoes" element={<div>Página de Configurações</div>} />
        </Route>
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequireOwner", () => {
  it("owner vê a página protegida", () => {
    renderWithRoute("owner");
    expect(screen.getByText("Página de Configurações")).toBeInTheDocument();
  });

  it("membro é redirecionado para /dashboard", () => {
    renderWithRoute("member");
    expect(screen.queryByText("Página de Configurações")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("usuário sem perfil é redirecionado para /dashboard", () => {
    renderWithRoute(null);
    expect(screen.queryByText("Página de Configurações")).not.toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
