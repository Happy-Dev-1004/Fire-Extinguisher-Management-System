import { useAuth } from "../hooks/useAuth";

export function DashboardPage() {
  const { profile } = useAuth();

  return (
    <div>
      <h1 className="page-title mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">
        Bem-vindo, <span className="font-medium text-gray-700">{profile?.nome}</span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            Acesso
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {profile?.role === "owner" ? "Proprietário" : "Membro"}
          </p>
        </div>

        <div className="card p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            E-mail
          </p>
          <p className="text-sm font-medium text-gray-900 truncate">{profile?.email}</p>
        </div>
      </div>

      <div className="card p-8 mt-6 text-center text-gray-400">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-sm">Estatísticas e gráficos serão exibidos aqui.</p>
      </div>
    </div>
  );
}
