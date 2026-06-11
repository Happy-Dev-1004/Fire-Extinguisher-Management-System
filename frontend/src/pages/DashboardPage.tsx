import { useAuth } from "../hooks/useAuth";
import { Flame, HardHat, Send, Settings, ArrowRight, Shield } from "lucide-react";
import { Link } from "react-router-dom";

const QUICK_LINKS = [
  {
    to: "/extintores",
    label: "Extintores",
    desc: "Cadastre e gerencie extintores por unidade e setor.",
    Icon: Flame,
    color: "bg-orange-50 text-orange-600",
  },
  {
    to: "/inspetores",
    label: "Inspetores",
    desc: "Gerencie a equipe de inspeção e acesso via WhatsApp.",
    Icon: HardHat,
    color: "bg-sky-50 text-sky-600",
  },
  {
    to: "/destinatarios",
    label: "Destinatários",
    desc: "Configure quem recebe as fichas por unidade.",
    Icon: Send,
    color: "bg-violet-50 text-violet-600",
  },
];

const OWNER_LINKS = [
  {
    to: "/configuracoes",
    label: "Configurações",
    desc: "Chaves de API e segredos operacionais (criptografados).",
    Icon: Settings,
  },
];

export function DashboardPage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Bem-vindo de volta,{" "}
          <span className="font-semibold text-gray-700">{profile?.nome}</span>.
          Aqui está o seu painel de controle.
        </p>
      </div>

      {/* Identity cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Perfil de acesso</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">
              {isOwner ? "Proprietário" : "Membro"}
            </p>
          </div>
        </div>

        <div className="card p-5 sm:col-span-2 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-xl select-none">
            {profile?.nome?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Conta</p>
            <p className="text-base font-bold text-gray-900 truncate mt-0.5">{profile?.nome}</p>
            <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
          </div>
        </div>
      </div>

      {/* Quick access */}
      <section>
        <h2 className="section-title mb-4">Acesso rápido</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_LINKS.map(({ to, label, desc, Icon, color }) => (
            <Link
              key={to}
              to={to}
              className="card-hover p-5 flex flex-col gap-4 group"
            >
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">{label}</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</p>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-brand-600 group-hover:gap-2 transition-all">
                Acessar <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Owner-only section */}
      {isOwner && (
        <section>
          <h2 className="section-title mb-4 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Administração (proprietário)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {OWNER_LINKS.map(({ to, label, desc, Icon }) => (
              <Link
                key={to}
                to={to}
                className="card-hover p-5 flex items-center gap-4 group"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed truncate">{desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-600 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Coming soon */}
      <div className="card p-8 text-center border-dashed">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
          <Flame className="w-6 h-6 text-gray-300" />
        </div>
        <p className="text-sm font-medium text-gray-500">Estatísticas e gráficos em breve</p>
        <p className="text-xs text-gray-400 mt-1">Resumo de inspeções, vencimentos e irregularidades por unidade.</p>
      </div>
    </div>
  );
}
