import { useState, useEffect, type FormEvent } from "react";
import { configApi } from "../lib/api";
import type { Configuracao } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import { formatarDataHora } from "../lib/formatters";
import { Key, CheckCircle2, AlertCircle, Settings, Eye, EyeOff } from "lucide-react";

const LABELS: Record<string, string> = {
  OPENAI_API_KEY:    "Chave OpenAI",
  ZAPI_INSTANCE_ID:  "Z-API Instance ID",
  ZAPI_TOKEN:        "Z-API Token",
  ZAPI_CLIENT_TOKEN: "Z-API Client Token",
  WHATSAPP_NUMERO:   "Número WhatsApp",
  OPENAI_LIMITE_TOKENS_MES: "Limite mensal de tokens (OpenAI)",
  ZAPI_RENOVA_EM:    "Data de renovação da Z-API",
};

const DICAS: Record<string, string> = {
  OPENAI_API_KEY:    "Começa com sk- (dashboard.openai.com)",
  ZAPI_INSTANCE_ID:  "ID da instância no painel Z-API",
  ZAPI_TOKEN:        "Token de acesso Z-API",
  ZAPI_CLIENT_TOKEN: "Client-Token do cabeçalho Z-API",
  WHATSAPP_NUMERO:   "DDI + DDD + número, só dígitos. Ex: 5542999990000",
  OPENAI_LIMITE_TOKENS_MES: "Alerta quando o uso mensal chegar perto deste limite. Ex: 2000000",
  ZAPI_RENOVA_EM:    "Avisa antes do vencimento da assinatura. Formato AAAA-MM-DD",
};

export function ConfiguracoesPage() {
  const [configs, setConfigs]       = useState<Configuracao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]             = useState("");
  const [editando, setEditando]     = useState<string | null>(null);
  const [valor, setValor]           = useState("");
  const [mostrar, setMostrar]       = useState(false);
  const [salvando, setSalvando]     = useState(false);

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const { configuracoes } = await configApi.listar();
      setConfigs(configuracoes);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar configurações.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const handleSalvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    try {
      const { valor_mascarado } = await configApi.atualizar(editando, valor);
      toast(`${LABELS[editando] ?? editando} salvo — ${valor_mascarado}`);
      setEditando(null);
      setValor("");
      void carregar();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Erro ao salvar.", "erro");
    } finally {
      setSalvando(false);
    }
  };

  const configurados = configs.filter((c) => c.configurado).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">
          Segredos operacionais — armazenados criptografados. Somente o proprietário pode alterar.
        </p>
      </div>

      {/* Summary card */}
      {!carregando && configs.length > 0 && (
        <div className="card p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            configurados === configs.length ? "bg-green-50" : "bg-amber-50"
          }`}>
            <Settings className={`w-5 h-5 ${configurados === configs.length ? "text-green-600" : "text-amber-600"}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {configurados} de {configs.length} configurações ativas
            </p>
            <p className="text-xs text-gray-400">
              {configurados === configs.length
                ? "Todas as integrações estão configuradas."
                : `${configs.length - configurados} ainda precisam de configuração.`}
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {erro && (
        <div className="flex items-center gap-2.5 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      {/* Skeleton */}
      {carregando && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-4 flex items-center gap-4">
              <div className="skeleton w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-48" />
              </div>
              <div className="skeleton h-8 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Config list */}
      {!carregando && (
        <div className="space-y-3">
          {configs.map((c) => (
            <div key={c.nome} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                c.configurado ? "bg-green-50" : "bg-gray-100"
              }`}>
                <Key className={`w-4 h-4 ${c.configurado ? "text-green-600" : "text-gray-400"}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">
                    {LABELS[c.nome] ?? c.nome}
                  </span>
                  {c.configurado ? (
                    <span className="badge-green">
                      <CheckCircle2 className="w-3 h-3" /> Configurado
                    </span>
                  ) : (
                    <span className="badge-amber">
                      <AlertCircle className="w-3 h-3" /> Pendente
                    </span>
                  )}
                </div>
                {c.configurado && c.valor_mascarado && (
                  <p className="text-xs text-gray-500 font-mono mt-1">{c.valor_mascarado}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{DICAS[c.nome]}</p>
                {c.configurado && c.updated_at && (
                  <p className="text-xs text-gray-300 mt-0.5">
                    Atualizado em {formatarDataHora(c.updated_at)}
                  </p>
                )}
              </div>

              <button
                onClick={() => { setEditando(c.nome); setValor(""); setMostrar(false); }}
                className="btn-secondary btn-sm shrink-0"
              >
                {c.configurado ? "Alterar" : "Configurar"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      <Modal
        open={!!editando}
        titulo={`Configurar ${editando ? (LABELS[editando] ?? editando) : ""}`}
        onClose={() => { setEditando(null); setValor(""); }}
        largura="max-w-md"
      >
        <form onSubmit={handleSalvar} className="space-y-4">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 leading-relaxed">
            O valor é criptografado antes de ser salvo. A interface nunca exibe o texto completo.
          </div>

          <div>
            <label htmlFor="valor-secreto" className="label">Valor</label>
            <div className="relative">
              <input
                id="valor-secreto"
                type={mostrar ? "text" : "password"}
                autoComplete="off"
                className="input font-mono pr-10"
                placeholder={editando ? DICAS[editando] : ""}
                value={valor}
                required
                onChange={(e) => setValor(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setMostrar((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setEditando(null); setValor(""); }}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button type="submit" disabled={salvando || !valor} className="btn-primary flex-1">
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
