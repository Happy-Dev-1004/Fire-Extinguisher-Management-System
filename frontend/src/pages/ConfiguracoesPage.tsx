import { useState, useEffect, type FormEvent } from "react";
import { configApi } from "../lib/api";
import type { Configuracao } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import { formatarDataHora } from "../lib/formatters";

const LABELS: Record<string, string> = {
  OPENAI_API_KEY:    "Chave OpenAI",
  ZAPI_INSTANCE_ID:  "Z-API Instance ID",
  ZAPI_TOKEN:        "Z-API Token",
  ZAPI_CLIENT_TOKEN: "Z-API Client Token",
  WHATSAPP_NUMERO:   "Número WhatsApp",
};

const DICAS: Record<string, string> = {
  OPENAI_API_KEY:    "Começa com sk- (dashboard.openai.com)",
  ZAPI_INSTANCE_ID:  "ID da instância no painel Z-API",
  ZAPI_TOKEN:        "Token de acesso Z-API",
  ZAPI_CLIENT_TOKEN: "Client-Token do cabeçalho Z-API",
  WHATSAPP_NUMERO:   "DDI + DDD + número, só dígitos. Ex: 5542999990000",
};

export function ConfiguracoesPage() {
  const [configs, setConfigs]   = useState<Configuracao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]         = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor]       = useState("");
  const [salvando, setSalvando] = useState(false);

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

  return (
    <div>
      <h1 className="page-title mb-1">Configurações</h1>
      <p className="text-sm text-gray-500 mb-6">
        Segredos operacionais — armazenados criptografados. Somente o proprietário pode alterar.
      </p>

      {erro && (
        <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{erro}</div>
      )}

      {carregando ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((c) => (
            <div key={c.nome} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">
                    {LABELS[c.nome] ?? c.nome}
                  </span>
                  {c.configurado ? (
                    <span className="badge-green">Configurado</span>
                  ) : (
                    <span className="badge-yellow">Não configurado</span>
                  )}
                </div>
                {c.configurado && c.valor_mascarado && (
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{c.valor_mascarado}</p>
                )}
                {c.configurado && c.updated_at && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Atualizado em {formatarDataHora(c.updated_at)}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{DICAS[c.nome]}</p>
              </div>
              <button
                onClick={() => { setEditando(c.nome); setValor(""); }}
                className="btn-secondary btn-sm shrink-0"
              >
                {c.configurado ? "Alterar" : "Configurar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editando}
        titulo={`Configurar ${editando ? (LABELS[editando] ?? editando) : ""}`}
        onClose={() => { setEditando(null); setValor(""); }}
        largura="max-w-md"
      >
        <form onSubmit={handleSalvar} className="space-y-4">
          <div>
            <label htmlFor="valor-secreto" className="label">
              Valor
            </label>
            <input
              id="valor-secreto"
              type="password"
              autoComplete="off"
              className="input font-mono"
              placeholder={editando ? DICAS[editando] : ""}
              value={valor}
              required
              onChange={(e) => setValor(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">
              O valor é criptografado antes de ser salvo. A tela nunca exibe o texto completo.
            </p>
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
