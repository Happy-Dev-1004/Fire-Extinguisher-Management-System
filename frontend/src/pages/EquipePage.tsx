import { useState, useEffect, type FormEvent } from "react";
import { equipeApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { AdminMember, Convite } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import { formatarData, formatarDataHora } from "../lib/formatters";

export function EquipePage() {
  const { profile } = useAuth();
  const [membros, setMembros]   = useState<AdminMember[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]             = useState("");

  // Convidar
  const [modalConvite, setModalConvite] = useState(false);
  const [emailConvite, setEmailConvite] = useState("");
  const [enviando, setEnviando]         = useState(false);
  const [linkGerado, setLinkGerado]     = useState("");

  // Transferir posse
  const [modalTransferir, setModalTransferir] = useState(false);
  const [novoOwner, setNovoOwner]           = useState<AdminMember | null>(null);
  const [transferindo, setTransferindo]     = useState(false);

  // Confirmações
  const [confirmRemover, setConfirmRemover] = useState<AdminMember | null>(null);
  const [confirmRevogar, setConfirmRevogar] = useState<Convite | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const { admins, convites: c } = await equipeApi.listar();
      setMembros(admins);
      setConvites(c.filter((cv) => cv.status === "pendente"));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar equipe.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const handleConvidar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const res = await equipeApi.convidar(emailConvite.trim());
      setLinkGerado(res.link);
      toast("Convite criado com sucesso!");
      void carregar();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Erro ao criar convite.", "erro");
    } finally {
      setEnviando(false);
    }
  };

  const handleRevogar = async () => {
    if (!confirmRevogar) return;
    try {
      await equipeApi.revogarConvite(confirmRevogar.id);
      toast("Convite revogado.");
      setConfirmRevogar(null);
      void carregar();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao revogar.", "erro");
    }
  };

  const handleRemover = async () => {
    if (!confirmRemover) return;
    try {
      await equipeApi.removerMembro(confirmRemover.id);
      toast(`${confirmRemover.nome} removido da equipe.`);
      setConfirmRemover(null);
      void carregar();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao remover.", "erro");
    }
  };

  const handleTransferir = async () => {
    if (!novoOwner) return;
    setTransferindo(true);
    try {
      await equipeApi.transferirPosse(novoOwner.id);
      toast("Posse transferida. Você agora é membro.");
      setModalTransferir(false);
      setNovoOwner(null);
      void carregar();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao transferir.", "erro");
    } finally {
      setTransferindo(false);
    }
  };

  const statusConviteBadge = (status: string) => {
    if (status === "pendente") return <span className="badge-yellow">Pendente</span>;
    if (status === "aceito")   return <span className="badge-green">Aceito</span>;
    return <span className="badge-gray">{status}</span>;
  };

  const membrosAtivos = membros.filter((m) => m.ativo);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title mb-0.5">Equipe</h1>
          <p className="text-sm text-gray-500">Gerencie administradores e convites de acesso.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setModalConvite(true); setEmailConvite(""); setLinkGerado(""); }}
            className="btn-primary"
          >
            + Convidar membro
          </button>
          {membrosAtivos.some((m) => m.role === "member") && (
            <button onClick={() => setModalTransferir(true)} className="btn-secondary">
              Transferir posse
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">{erro}</div>
      )}

      {carregando ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Membros ────────────────────────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Administradores ({membrosAtivos.length})
            </h2>
            <div className="card overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {membrosAtivos.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {/* Avatar */}
                    <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm shrink-0">
                      {m.nome[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{m.nome}</span>
                        {m.role === "owner" ? (
                          <span className="badge-blue">Proprietário</span>
                        ) : (
                          <span className="badge-gray">Membro</span>
                        )}
                        {m.email === profile?.email && (
                          <span className="badge-green">Você</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{m.email}</p>
                      <p className="text-xs text-gray-400">
                        Desde {formatarData(m.created_at)}
                      </p>
                    </div>
                    {/* Actions — cannot remove owner or self */}
                    {m.role !== "owner" && m.email !== profile?.email && (
                      <button
                        onClick={() => setConfirmRemover(m)}
                        className="btn-danger btn-sm shrink-0"
                      >
                        Remover
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── Convites pendentes ────────────────────────────────────────── */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Convites pendentes ({convites.length})
            </h2>
            {convites.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum convite pendente.</p>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {["E-mail", "Status", "Expira em", ""].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {convites.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-900">{c.email}</td>
                          <td className="px-4 py-3">{statusConviteBadge(c.status)}</td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            {formatarDataHora(c.expira_em)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setConfirmRevogar(c)}
                              className="btn-secondary btn-sm"
                            >
                              Revogar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Modal: convidar ──────────────────────────────────────────────── */}
      <Modal
        open={modalConvite}
        titulo="Convidar novo membro"
        onClose={() => { setModalConvite(false); setLinkGerado(""); }}
        largura="max-w-md"
      >
        {!linkGerado ? (
          <form onSubmit={handleConvidar} className="space-y-4">
            <div>
              <label htmlFor="email-convite" className="label">
                E-mail do novo membro
              </label>
              <input
                id="email-convite"
                type="email"
                className="input"
                placeholder="colaborador@empresa.com"
                required
                value={emailConvite}
                onChange={(e) => setEmailConvite(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                O link de convite expira em 7 dias. Compartilhe-o com a pessoa.
              </p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setModalConvite(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button type="submit" disabled={enviando || !emailConvite} className="btn-primary flex-1">
                {enviando ? "Enviando…" : "Gerar convite"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              ✓ Convite criado! Compartilhe o link abaixo com o novo membro.
            </p>
            <div>
              <label className="label">Link de convite</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  className="input font-mono text-xs"
                  value={linkGerado}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="btn-secondary btn-sm shrink-0"
                  onClick={() => {
                    void navigator.clipboard.writeText(linkGerado);
                    toast("Link copiado!");
                  }}
                >
                  Copiar
                </button>
              </div>
            </div>
            <button onClick={() => { setModalConvite(false); setLinkGerado(""); }} className="btn-primary w-full">
              Fechar
            </button>
          </div>
        )}
      </Modal>

      {/* ── Modal: transferir posse ─────────────────────────────────────── */}
      <Modal
        open={modalTransferir}
        titulo="Transferir propriedade"
        onClose={() => { setModalTransferir(false); setNovoOwner(null); }}
        largura="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            ⚠️ Atenção: você perderá acesso às configurações e ao gerenciamento de equipe.
            Esta ação não pode ser desfeita sem a cooperação do novo proprietário.
          </p>
          <div>
            <label className="label">Selecione o novo proprietário</label>
            <select
              className="input"
              value={novoOwner?.id ?? ""}
              onChange={(e) => {
                const m = membrosAtivos.find((m) => m.id === e.target.value);
                setNovoOwner(m ?? null);
              }}
            >
              <option value="">— selecione —</option>
              {membrosAtivos
                .filter((m) => m.role === "member")
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} ({m.email})
                  </option>
                ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setModalTransferir(false); setNovoOwner(null); }}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button
              onClick={handleTransferir}
              disabled={!novoOwner || transferindo}
              className="btn-danger flex-1"
            >
              {transferindo ? "Transferindo…" : "Confirmar transferência"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Confirm: remover membro ─────────────────────────────────────── */}
      <Modal
        open={!!confirmRemover}
        titulo="Remover membro"
        onClose={() => setConfirmRemover(null)}
        largura="max-w-sm"
      >
        <p className="text-sm text-gray-700 mb-4">
          Tem certeza que deseja remover <strong>{confirmRemover?.nome}</strong> da equipe?
          O acesso será revogado imediatamente.
        </p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmRemover(null)} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleRemover} className="btn-danger flex-1">Remover</button>
        </div>
      </Modal>

      {/* ── Confirm: revogar convite ────────────────────────────────────── */}
      <Modal
        open={!!confirmRevogar}
        titulo="Revogar convite"
        onClose={() => setConfirmRevogar(null)}
        largura="max-w-sm"
      >
        <p className="text-sm text-gray-700 mb-4">
          Revogar o convite para <strong>{confirmRevogar?.email}</strong>?
          O link não poderá mais ser usado.
        </p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmRevogar(null)} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleRevogar} className="btn-danger flex-1">Revogar</button>
        </div>
      </Modal>
    </div>
  );
}
