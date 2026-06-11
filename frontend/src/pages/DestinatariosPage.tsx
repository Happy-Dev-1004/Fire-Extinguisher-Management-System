import { useState, useEffect, type FormEvent } from "react";
import { destinatariosApi, fichaApi } from "../lib/api";
import type { Destinatario, DestinatarioResolvido, ResultadoEnvioMulti } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import {
  Plus, Pencil, UserMinus, UserCheck, Send, Globe, MapPin,
  CheckCircle2, XCircle, Loader2, AlertTriangle, Users,
  MessageCircle, Mail,
} from "lucide-react";

const TODAS_UNIDADES_SENTINEL = "*";
const TODAS_UNIDADES_LABEL    = "Todas as unidades";

type FormData = { nome: string; telefone: string; email: string; unidade: string; ativo: boolean };
const FORM_VAZIO: FormData = { nome: "", telefone: "", email: "", unidade: "", ativo: true };

function unidadeLabel(u: string) { return u === TODAS_UNIDADES_SENTINEL ? TODAS_UNIDADES_LABEL : u; }

function groupByUnidade(list: Destinatario[]) {
  const map = new Map<string, Destinatario[]>();
  for (const d of list) {
    const bucket = map.get(d.unidade) ?? [];
    bucket.push(d);
    map.set(d.unidade, bucket);
  }
  return map;
}

function sortedGroupKeys(map: Map<string, Destinatario[]>) {
  return [...map.keys()].sort((a, b) => {
    if (a === TODAS_UNIDADES_SENTINEL) return -1;
    if (b === TODAS_UNIDADES_SENTINEL) return 1;
    return a.localeCompare(b, "pt-BR");
  });
}

export function DestinatariosPage() {
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [carregando, setCarregando]       = useState(true);
  const [erro, setErro]                   = useState("");

  const [modalAberto, setModalAberto]     = useState(false);
  const [editando, setEditando]           = useState<Destinatario | null>(null);
  const [form, setForm]                   = useState<FormData>(FORM_VAZIO);
  const [salvando, setSalvando]           = useState(false);
  const [erroForm, setErroForm]           = useState("");

  const [modalEnvio, setModalEnvio]       = useState(false);
  const [enviandoUnidade, setEnviandoUnidade] = useState("");
  const [envioMes, setEnvioMes]           = useState("");
  const [previewDest, setPreviewDest]     = useState<DestinatarioResolvido[]>([]);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [enviando, setEnviando]           = useState(false);
  const [resultadoEnvio, setResultadoEnvio] = useState<{
    enviados: number; falhas: number; detalhes: ResultadoEnvioMulti[];
  } | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const { destinatarios: lista } = await destinatariosApi.listar();
      setDestinatarios(lista);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar destinatários.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  function abrirAdicionar() {
    setEditando(null); setForm(FORM_VAZIO); setErroForm(""); setModalAberto(true);
  }
  function abrirEditar(d: Destinatario) {
    setEditando(d);
    setForm({ nome: d.nome, telefone: d.telefone, email: d.email ?? "", unidade: d.unidade, ativo: d.ativo });
    setErroForm(""); setModalAberto(true);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true); setErroForm("");
    const unidadeNormalizada =
      form.unidade.trim().toLowerCase() === "todas as unidades"
        ? TODAS_UNIDADES_SENTINEL : form.unidade.trim();
    const payload = { ...form, unidade: unidadeNormalizada };
    try {
      if (editando) {
        await destinatariosApi.atualizar(editando.id, payload);
        toast("Destinatário atualizado.");
      } else {
        await destinatariosApi.criar(payload);
        toast("Destinatário cadastrado.");
      }
      setModalAberto(false);
      await carregar();
    } catch (e: unknown) {
      setErroForm(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function desativar(d: Destinatario) {
    if (!confirm(`Desativar "${d.nome}"? Histórico preservado.`)) return;
    try {
      await destinatariosApi.remover(d.id);
      toast("Destinatário desativado.");
      await carregar();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao desativar.", "erro");
    }
  }

  async function reativar(d: Destinatario) {
    try {
      await destinatariosApi.atualizar(d.id, { ativo: true });
      toast("Destinatário reativado.");
      await carregar();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao reativar.", "erro");
    }
  }

  async function abrirEnvio(unidade: string) {
    setEnviandoUnidade(unidade); setEnvioMes(""); setPreviewDest([]);
    setResultadoEnvio(null); setCarregandoPreview(true); setModalEnvio(true);
    try {
      const { destinatarios: lista } = await fichaApi.previewDestinatarios(unidade);
      setPreviewDest(lista);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao carregar preview.", "erro");
    } finally {
      setCarregandoPreview(false);
    }
  }

  async function confirmarEnvio(e: FormEvent) {
    e.preventDefault();
    if (!envioMes.trim()) return;
    setEnviando(true);
    try {
      const r = await fichaApi.enviar(enviandoUnidade, envioMes.trim());
      setResultadoEnvio({ enviados: r.enviados, falhas: r.falhas, detalhes: r.detalhes });
      toast(
        r.falhas === 0
          ? `Ficha enviada para ${r.enviados} destinatário(s).`
          : `${r.enviados} enviados, ${r.falhas} falha(s).`,
        r.falhas === 0 ? "sucesso" : "info",
      );
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao enviar ficha.", "erro");
    } finally {
      setEnviando(false);
    }
  }

  const grupos    = groupByUnidade(destinatarios);
  const groupKeys = sortedGroupKeys(grupos);
  const totalAtivos = destinatarios.filter((d) => d.ativo).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Destinatários</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalAtivos} destinatário{totalAtivos !== 1 ? "s" : ""} ativo{totalAtivos !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={abrirAdicionar} className="btn-primary sm:w-auto w-full">
          <Plus className="w-4 h-4" /> Novo destinatário
        </button>
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
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card overflow-hidden">
              <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton h-4 w-16" />
              </div>
              {[...Array(2)].map((__, j) => (
                <div key={j} className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 last:border-0">
                  <div className="skeleton h-4 w-36" />
                  <div className="skeleton h-4 w-28 ml-auto" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!carregando && destinatarios.length === 0 && !erro && (
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">Nenhum destinatário cadastrado ainda.</p>
          <p className="text-xs text-gray-400 mt-1">
            Cadastre quem deve receber as fichas de inspeção por WhatsApp.
          </p>
          <button onClick={abrirAdicionar} className="btn-primary btn-sm mt-4 mx-auto">
            <Plus className="w-3.5 h-3.5" /> Adicionar destinatário
          </button>
        </div>
      )}

      {/* Groups */}
      {!carregando && (
        <div className="space-y-4">
          {groupKeys.map((unidade) => {
            const lista  = grupos.get(unidade) ?? [];
            const ativos = lista.filter((d) => d.ativo).length;
            const isTodas = unidade === TODAS_UNIDADES_SENTINEL;

            return (
              <section key={unidade} className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/70">
                  <div className="flex items-center gap-2.5">
                    {isTodas
                      ? <Globe className="w-4 h-4 text-violet-500" />
                      : <MapPin className="w-4 h-4 text-gray-400" />
                    }
                    <span className="text-sm font-semibold text-gray-900">{unidadeLabel(unidade)}</span>
                    <span className="badge-gray">{ativos} ativo{ativos !== 1 ? "s" : ""}</span>
                  </div>
                  {!isTodas && ativos > 0 && (
                    <button
                      onClick={() => abrirEnvio(unidade)}
                      className="btn-secondary btn-sm"
                    >
                      <Send className="w-3.5 h-3.5" /> Enviar ficha
                    </button>
                  )}
                </div>

                <ul className="divide-y divide-gray-100">
                  {lista.map((d) => (
                    <li key={d.id} className={`flex items-center justify-between gap-4 px-5 py-3.5 ${!d.ativo ? "opacity-50 bg-gray-50/50" : ""}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {d.nome}
                          {!d.ativo && <span className="ml-2 badge-gray text-[10px]">inativo</span>}
                        </p>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          {d.telefone && (
                            <span className="text-xs text-gray-400 truncate flex items-center gap-1">
                              <MessageCircle className="w-3 h-3 text-green-500" /> {d.telefone}
                            </span>
                          )}
                          {d.email && (
                            <span className="text-xs text-gray-400 truncate flex items-center gap-1">
                              <Mail className="w-3 h-3 text-blue-500" /> {d.email}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => abrirEditar(d)} className="btn-icon w-8 h-8" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {d.ativo ? (
                          <button
                            onClick={() => desativar(d)}
                            className="btn-icon w-8 h-8 hover:bg-red-50 hover:text-red-600"
                            title="Desativar"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => reativar(d)}
                            className="btn-icon w-8 h-8 hover:bg-green-50 hover:text-green-600"
                            title="Reativar"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalAberto}
        titulo={editando ? "Editar destinatário" : "Novo destinatário"}
        onClose={() => { if (!salvando) setModalAberto(false); }}
      >
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label className="label">Nome</label>
            <input
              type="text" required minLength={2}
              className="input"
              placeholder="Nome completo"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Telefone (WhatsApp)</label>
            <input
              type="tel"
              className="input"
              placeholder="(71) 9 9999-9999"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input
              type="email"
              className="input"
              placeholder="nome@empresa.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <p className="field-hint">
              Informe <strong>WhatsApp e/ou e-mail</strong>. A ficha é enviada por todos os canais preenchidos.
            </p>
          </div>
          <div>
            <label className="label">Unidade</label>
            <input
              type="text" required
              className="input"
              placeholder='Ex: Itabuna  ou  "Todas as unidades"'
              value={form.unidade === TODAS_UNIDADES_SENTINEL ? TODAS_UNIDADES_LABEL : form.unidade}
              onChange={(e) => {
                const v = e.target.value;
                setForm({
                  ...form,
                  unidade: v.trim().toLowerCase() === "todas as unidades"
                    ? TODAS_UNIDADES_SENTINEL : v,
                });
              }}
            />
            <p className="field-hint">
              Digite <strong>Todas as unidades</strong> para receber a ficha de todos os locais.
            </p>
          </div>
          {editando && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm font-medium text-gray-700">Ativo</span>
            </label>
          )}
          {erroForm && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{erroForm}</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setModalAberto(false)} disabled={salvando} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-primary">
              {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Send Ficha Modal */}
      <Modal
        open={modalEnvio}
        titulo={`Enviar ficha — ${unidadeLabel(enviandoUnidade)}`}
        onClose={() => { if (!enviando) setModalEnvio(false); }}
        largura="max-w-md"
      >
        {resultadoEnvio ? (
          <div className="space-y-4">
            <div className={`flex items-center gap-2.5 p-3.5 rounded-xl border ${
              resultadoEnvio.falhas === 0
                ? "bg-green-50 border-green-200"
                : "bg-amber-50 border-amber-200"
            }`}>
              {resultadoEnvio.falhas === 0
                ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              }
              <p className={`text-sm font-medium ${resultadoEnvio.falhas === 0 ? "text-green-800" : "text-amber-800"}`}>
                {resultadoEnvio.falhas === 0
                  ? `Ficha enviada para ${resultadoEnvio.enviados} destinatário(s).`
                  : `${resultadoEnvio.enviados} enviados, ${resultadoEnvio.falhas} falha(s).`}
              </p>
            </div>
            <div className="card overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {resultadoEnvio.detalhes.map((r) => (
                  <li key={r.destinatario.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-800 mb-1.5">{r.destinatario.nome}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.whatsapp.tentado && (
                        r.whatsapp.ok ? (
                          <span className="badge-green"><MessageCircle className="w-3 h-3" /> WhatsApp ✓</span>
                        ) : (
                          <span className="badge-red" title={r.whatsapp.motivo}>
                            <MessageCircle className="w-3 h-3" /> WhatsApp ✗
                          </span>
                        )
                      )}
                      {r.email.tentado && (
                        r.email.ok ? (
                          <span className="badge-green"><Mail className="w-3 h-3" /> E-mail ✓</span>
                        ) : (
                          <span className="badge-red" title={r.email.motivo}>
                            <Mail className="w-3 h-3" /> E-mail ✗
                          </span>
                        )
                      )}
                    </div>
                    {(r.whatsapp.motivo || r.email.motivo) && (
                      <p className="text-[11px] text-red-500 mt-1">
                        {[r.whatsapp.ok ? null : r.whatsapp.motivo, r.email.ok ? null : r.email.motivo]
                          .filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setModalEnvio(false)} className="btn-primary">Fechar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={confirmarEnvio} className="space-y-4">
            <div>
              <label className="label">Mês de referência</label>
              <input
                type="text" required
                className="input"
                placeholder="Ex: Maio/2026"
                value={envioMes}
                onChange={(e) => setEnvioMes(e.target.value)}
              />
            </div>
            <div>
              <p className="section-title mb-2">Destinatários que receberão a ficha</p>
              {carregandoPreview ? (
                <div className="flex items-center gap-2 py-3 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                </div>
              ) : previewDest.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">Nenhum destinatário ativo para esta unidade.</p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <ul className="divide-y divide-gray-100">
                    {previewDest.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm font-medium text-gray-800">{d.nome}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {d.telefone && <MessageCircle className="w-3.5 h-3.5 text-green-500" />}
                          {d.email && <Mail className="w-3.5 h-3.5 text-blue-500" />}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setModalEnvio(false)}
                disabled={enviando}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando || previewDest.length === 0 || carregandoPreview}
                className="btn-primary"
              >
                {enviando ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Enviando…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="w-4 h-4" /> Confirmar envio
                  </span>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
