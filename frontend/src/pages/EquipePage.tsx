import { useState, useEffect, type FormEvent } from "react";
import { equipeApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import type { AdminMember, Convite } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import { formatarData, formatarDataHora } from "../lib/formatters";
import {
  UserPlus, UserX, ArrowLeftRight, Clock, Users,
  Mail, Copy, CheckCircle2, AlertTriangle, Crown, UserCircle,
} from "lucide-react";

export function EquipePage() {
  const { profile } = useAuth();
  const [membros, setMembros]           = useState<AdminMember[]>([]);
  const [convites, setConvites]         = useState<Convite[]>([]);
  const [carregando, setCarregando]     = useState(true);
  const [erro, setErro]                 = useState("");

  const [modalConvite, setModalConvite]     = useState(false);
  const [emailConvite, setEmailConvite]     = useState("");
  const [enviando, setEnviando]             = useState(false);
  const [linkGerado, setLinkGerado]         = useState("");

  const [modalTransferir, setModalTransferir] = useState(false);
  const [novoOwner, setNovoOwner]             = useState<AdminMember | null>(null);
  const [transferindo, setTransferindo]       = useState(false);

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

  const membrosAtivos = membros.filter((m) => m.ativo);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Equipe</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie administradores e convites de acesso.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setModalConvite(true); setEmailConvite(""); setLinkGerado(""); }}
            className="btn-primary"
          >
            <UserPlus className="w-4 h-4" /> Convidar membro
          </button>
          {membrosAtivos.some((m) => m.role === "member") && (
            <button onClick={() => setModalTransferir(true)} className="btn-secondary">
              <ArrowLeftRight className="w-4 h-4" /> Transferir posse
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {erro && (
        <div className="flex items-center gap-2.5 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      {/* Skeleton */}
      {carregando && (
        <div className="card divide-y divide-gray-100">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="skeleton w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!carregando && (
        <>
          {/* Members */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-gray-400" />
              <h2 className="section-title">Administradores ({membrosAtivos.length})</h2>
            </div>
            <div className="card overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {membrosAtivos.map((m) => {
                  const isMe = m.email === profile?.email;
                  const isOwner = m.role === "owner";
                  const initials = m.nome.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

                  return (
                    <li key={m.id} className="flex items-center gap-4 px-5 py-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                        isOwner ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900">{m.nome}</span>
                          {isOwner ? (
                            <span className="badge-brand">
                              <Crown className="w-3 h-3" /> Proprietário
                            </span>
                          ) : (
                            <span className="badge-gray">
                              <UserCircle className="w-3 h-3" /> Membro
                            </span>
                          )}
                          {isMe && <span className="badge-green">Você</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{m.email}</p>
                        <p className="text-xs text-gray-300 mt-0.5">Desde {formatarData(m.created_at)}</p>
                      </div>
                      {!isOwner && !isMe && (
                        <button
                          onClick={() => setConfirmRemover(m)}
                          className="btn-ghost btn-sm text-red-500 hover:bg-red-50 hover:text-red-600 shrink-0"
                        >
                          <UserX className="w-4 h-4" /> Remover
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* Pending invites */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-4 h-4 text-gray-400" />
              <h2 className="section-title">Convites pendentes ({convites.length})</h2>
            </div>
            {convites.length === 0 ? (
              <div className="card p-6 text-center">
                <p className="text-sm text-gray-400">Nenhum convite pendente.</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {["E-mail", "Status", "Expira em", ""].map((h) => (
                          <th key={h} className="table-th">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {convites.map((c) => (
                        <tr key={c.id} className="table-row">
                          <td className="table-td font-medium text-gray-900">{c.email}</td>
                          <td className="table-td">
                            <span className="badge-amber"><Clock className="w-3 h-3" /> Pendente</span>
                          </td>
                          <td className="table-td text-gray-500">{formatarDataHora(c.expira_em)}</td>
                          <td className="table-td text-right">
                            <button
                              onClick={() => setConfirmRevogar(c)}
                              className="btn-ghost btn-sm text-red-500 hover:bg-red-50"
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

      {/* Modal: convidar */}
      <Modal
        open={modalConvite}
        titulo="Convidar novo membro"
        onClose={() => { setModalConvite(false); setLinkGerado(""); }}
        largura="max-w-md"
      >
        {!linkGerado ? (
          <form onSubmit={handleConvidar} className="space-y-4">
            <div>
              <label htmlFor="email-convite" className="label">E-mail do novo membro</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="email-convite"
                  type="email"
                  className="input pl-9"
                  placeholder="colaborador@empresa.com"
                  required
                  value={emailConvite}
                  onChange={(e) => setEmailConvite(e.target.value)}
                />
              </div>
              <p className="field-hint">O link de convite expira em 7 dias. Compartilhe-o com a pessoa.</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setModalConvite(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button type="submit" disabled={enviando || !emailConvite} className="btn-primary flex-1">
                {enviando ? "Gerando…" : "Gerar convite"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 p-3.5 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 font-medium">Convite criado! Compartilhe o link abaixo.</p>
            </div>
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
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <button onClick={() => { setModalConvite(false); setLinkGerado(""); }} className="btn-primary w-full">
              Fechar
            </button>
          </div>
        )}
      </Modal>

      {/* Modal: transferir */}
      <Modal
        open={modalTransferir}
        titulo="Transferir propriedade"
        onClose={() => { setModalTransferir(false); setNovoOwner(null); }}
        largura="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Você perderá acesso às configurações e ao gerenciamento de equipe.
              Esta ação não pode ser desfeita sem a cooperação do novo proprietário.
            </p>
          </div>
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
                  <option key={m.id} value={m.id}>{m.nome} ({m.email})</option>
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

      {/* Confirm remove */}
      <Modal open={!!confirmRemover} titulo="Remover membro" onClose={() => setConfirmRemover(null)} largura="max-w-sm">
        <p className="text-sm text-gray-700 mb-4">
          Remover <strong>{confirmRemover?.nome}</strong> da equipe? O acesso será revogado imediatamente.
        </p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmRemover(null)} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleRemover} className="btn-danger flex-1">
            <UserX className="w-4 h-4" /> Remover
          </button>
        </div>
      </Modal>

      {/* Confirm revoke */}
      <Modal open={!!confirmRevogar} titulo="Revogar convite" onClose={() => setConfirmRevogar(null)} largura="max-w-sm">
        <p className="text-sm text-gray-700 mb-4">
          Revogar o convite para <strong>{confirmRevogar?.email}</strong>? O link não poderá mais ser usado.
        </p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmRevogar(null)} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleRevogar} className="btn-danger flex-1">Revogar</button>
        </div>
      </Modal>
    </div>
  );
}
