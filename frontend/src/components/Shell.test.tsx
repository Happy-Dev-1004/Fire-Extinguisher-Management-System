import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Shell } from "./Shell";

vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

// Mock Outlet so Shell renders without needing real child routes
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Outlet: () => <div>conteúdo da página</div>,
  };
});

import { useAuth } from "../hooks/useAuth";
const mockUseAuth = vi.mocked(useAuth);

function renderShell(role: "owner" | "member") {
  mockUseAuth.mockReturnValue({
    profile: { email: "test@test.com", nome: "Usuário Teste", role },
    loading: false,
    session: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  });

  return render(
    <MemoryRouter>
      <Shell />
    </MemoryRouter>
  );
}

describe("Shell — visibilidade do menu por role", () => {
  it("owner vê Dashboard, Extintores, Configurações e Equipe", () => {
    renderShell("owner");
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Extintores").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Configurações").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Equipe").length).toBeGreaterThan(0);
  });

  it("membro vê Dashboard e Extintores, mas NÃO vê Configurações nem Equipe", () => {
    renderShell("member");
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Extintores").length).toBeGreaterThan(0);
    expect(screen.queryByText("Configurações")).not.toBeInTheDocument();
    expect(screen.queryByText("Equipe")).not.toBeInTheDocument();
  });

  it("exibe o nome do usuário na barra lateral", () => {
    renderShell("owner");
    expect(screen.getAllByText("Usuário Teste").length).toBeGreaterThan(0);
  });

  it("membro vê 'Membro' no perfil, owner vê 'Proprietário'", () => {
    renderShell("member");
    expect(screen.getAllByText("Membro").length).toBeGreaterThan(0);

    renderShell("owner");
    expect(screen.getAllByText("Proprietário").length).toBeGreaterThan(0);
  });
});
