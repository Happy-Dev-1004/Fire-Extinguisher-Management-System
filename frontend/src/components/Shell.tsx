import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ToastContainer } from "./Toast";
import {
  LayoutDashboard, Flame, HardHat, Send, Settings, Users,
  LogOut, Menu, X, ChevronRight, Shield, FileText, Search, HelpCircle,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  Icon: React.ElementType;
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard",     label: "Dashboard",     Icon: LayoutDashboard },
  { to: "/extintores",    label: "Extintores",     Icon: Flame },
  { to: "/fichas",        label: "Fichas",         Icon: FileText },
  { to: "/busca",         label: "Busca / Relatórios", Icon: Search },
  { to: "/inspetores",    label: "Inspetores",     Icon: HardHat },
  { to: "/destinatarios", label: "Destinatários",  Icon: Send },
  { to: "/ajuda",         label: "Ajuda",          Icon: HelpCircle },
  { to: "/configuracoes", label: "Configurações",  Icon: Settings, ownerOnly: true },
  { to: "/equipe",        label: "Equipe",         Icon: Users,    ownerOnly: true },
];

export function Shell() {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: MouseEvent) => {
      const el = document.getElementById("mobile-sidebar");
      if (el && !el.contains(e.target as Node)) setSidebarOpen(false);
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

  const initials = profile?.nome
    ? profile.nome.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-600 shadow-sm">
          <Flame className="w-4 h-4 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-bold text-gray-900 tracking-tight">Gestão de</p>
          <p className="text-[13px] font-bold text-brand-600 tracking-tight">Extintores</p>
        </div>
        {mobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="btn-icon ml-auto"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        <p className="section-title px-3 pb-2">Menu</p>
        {visibleItems.map(({ to, label, Icon, ownerOnly }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : ownerOnly
                  ? "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-gray-400 group-hover:text-gray-600"}`} />
                <span className="flex-1">{label}</span>
                {ownerOnly && !false && (
                  <Shield className={`w-3 h-3 shrink-0 ${isActive ? "text-white/60" : "text-gray-300"}`} />
                )}
                {isActive && <ChevronRight className="w-3 h-3 text-white/60 shrink-0" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-100 p-3 shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 mb-1 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{profile?.nome}</p>
            <p className="text-xs text-gray-400 truncate">
              {profile?.role === "owner" ? "Proprietário" : "Membro"}
            </p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors duration-150"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 bg-white border-r border-gray-200">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        id="mobile-sidebar"
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 shadow-xl lg:hidden transition-transform duration-250 ease-out ${
          sidebarOpen ? "translate-x-0 animate-slide-in" : "-translate-x-full"
        }`}
        aria-label="Menu lateral"
      >
        <SidebarContent mobile />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — always visible, more prominent on desktop too */}
        <header className="flex items-center h-16 px-4 sm:px-6 bg-white border-b border-gray-200 shrink-0 sticky top-0 z-10">
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="btn-icon lg:hidden mr-2"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile brand (hidden on desktop — sidebar has it) */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-brand-600">
              <Flame className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900">Gestão de Extintores</span>
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-3">
            <span className={`badge ${profile?.role === "owner" ? "badge-brand" : "badge-gray"} hidden sm:inline-flex`}>
              {profile?.role === "owner" ? "Proprietário" : "Membro"}
            </span>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs">
                {initials}
              </div>
              <span className="text-sm font-medium text-gray-700 hidden sm:block">{profile?.nome}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fade-in">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}
