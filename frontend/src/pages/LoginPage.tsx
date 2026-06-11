import { useState, type FormEvent } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Flame, Mail, Lock, AlertCircle, CheckCircle } from "lucide-react";

export function LoginPage() {
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail]       = useState("");
  const [senha, setSenha]       = useState("");
  const [erro, setErro]         = useState("");
  const [enviando, setEnviando] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await signIn(email, senha);
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      setErro(err instanceof Error ? traduzirErro(err.message) : "Erro ao fazer login.");
    } finally {
      setEnviando(false);
    }
  };

  const features = [
    "Inspeções registradas via WhatsApp",
    "Fichas PDF geradas automaticamente",
    "Acesso por equipe com permissões",
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-[440px] lg:shrink-0 bg-brand-600 flex-col justify-between p-10 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Gestão de Extintores</span>
        </div>

        <div className="relative">
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Segurança<br />contra incêndio<br />sob controle.
          </h1>
          <p className="text-brand-200 text-sm leading-relaxed mb-8">
            Gerencie inspeções, extintores e relatórios em um painel
            centralizado — para Mansur, Barry Callebaut e qualquer unidade.
          </p>
          <div className="space-y-3">
            {features.map((t) => (
              <div key={t} className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-brand-200 shrink-0" />
                <span className="text-brand-100 text-sm">{t}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-brand-300 text-xs">
          Sistema de Gestão de Extintores de Incêndio
        </p>
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile brand */}
          <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-2xl bg-brand-600 flex items-center justify-center shadow-sm">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-tight">Gestão de Extintores</p>
              <p className="text-xs text-gray-400">Painel administrativo</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Entrar</h2>
            <p className="text-sm text-gray-500 mt-1">Acesse o painel com suas credenciais.</p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="label">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`input pl-9 ${erro ? "input-error" : ""}`}
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="senha" className="label">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={`input pl-9 ${erro ? "input-error" : ""}`}
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>
            </div>

            {erro && (
              <div role="alert" className="flex items-center gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{erro}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={enviando || !email || !senha}
              className="btn-primary w-full mt-2"
            >
              {enviando ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando…
                </span>
              ) : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function traduzirErro(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed"))        return "Confirme seu e-mail antes de entrar.";
  if (msg.includes("Too many requests"))          return "Muitas tentativas. Aguarde alguns minutos.";
  return "Erro ao fazer login. Tente novamente.";
}
