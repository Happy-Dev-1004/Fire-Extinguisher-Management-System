import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ToastContainer } from "./Toast";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard",    label: "Dashboard",    icon: "⊞" },
  { to: "/extintores",   label: "Extintores",   icon: "🔥" },
  { to: "/configuracoes", label: "Configurações", icon: "⚙️", ownerOnly: true },
  { to: "/equipe",       label: "Equipe",        icon: "👥", ownerOnly: true },
];

export function Shell() {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close sidebar on outside click (mobile)
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: MouseEvent) => {
      const sidebar = document.getElementById("sidebar");
      if (sidebar && !sidebar.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sidebarOpen]);

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.ownerOnly || profile?.role === "owner"
  );

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? "bg-brand-50 text-brand-700"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;

  const Sidebar = () => (
    <nav
      id="sidebar"
      className="flex flex-col h-full"
      aria-label="Navegação principal"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-200">
        <span className="text-2xl">🧯</span>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-tight">Gestão de</p>
          <p className="text-sm font-bold text-brand-600 leading-tight">Extintores</p>
        </div>
      </div>

      {/* Nav links */}
      <ul className="flex-1 space-y-1 p-3 overflow-y-auto">
        {visibleItems.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={navLinkClass}>
              <span className="w-5 text-center text-base leading-none" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* User info + sign out */}
      <div className="border-t border-gray-200 p-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
            {profile?.nome?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{profile?.nome}</p>
            <p className="text-xs text-gray-500 truncate">
              {profile?.role === "owner" ? "Proprietário" : "Membro"}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <span className="w-5 text-center" aria-hidden="true">↩</span>
          Sair
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-gray-200">
        <Sidebar />
      </aside>

      {/* ── Mobile sidebar overlay ───────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-72 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menu lateral"
      >
        <Sidebar />
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Abrir menu"
            aria-expanded={sidebarOpen}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-bold text-gray-900">🧯 Gestão de Extintores</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
