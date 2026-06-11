import { useState, useEffect, type FormEvent } from "react";
import { inspetoresApi } from "../lib/api";
import type { Inspetor } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import { formatarData } from "../lib/formatters";
import {
  Plus, Pencil, UserMinus, UserCheck, HardHat,
  Phone, AlertTriangle, CheckCircle2,
} from "lucide-react";

type FormData = { nome: string; telefone: string; unidade: string };
const FORM_VAZIO: FormData = { nome: "", telefone: "", unidade: "" };

export function InspetoresPage() {
  const [inspetores, setInspetores]   = useState<Inspetor[]>([]);
  const [carregando, setCarregando]   = useState(true);
  const [erro, setErro]               = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando]       = useState<Inspetor | null>(null);
  const [form, setForm]               = useState<FormData>(FORM_VAZIO);
  const [erroForm, setErroForm]       = useState("");
  const [salvando, setSalvando]       = useState(false);

  const [confirmDesativar, setConfirmDesativar] = useState<Inspetor | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const { inspetores: lista } = await inspetoresApi.listar();
      setInspetores(lista);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar inspetores.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setErroForm("");
    setModalAberto(true);
  }

  function abrirEditar(i: Inspetor) {
    setEditando(i);
    setForm({ nome: i.nome, telefone: i.telefone, unidade: i.unidade ?? "" });
    setErroForm("");
    setModalAberto(true);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroForm("");
    try {
      if (editando) {
        await inspetoresApi.atualizar(editando.id, {
          nome: form.nome.trim(),
          telefone: form.telefone.trim(),
          unidade: form.unidade.trim(),
        });
        toast("Inspetor atualizado.");
      } else {
        await inspetoresApi.criar({
          nome: form.nome.trim(),
          telefone: form.telefone.trim(),
          unidade: form.unidade.trim(),
        });
        toast("Inspetor cadastrado.");
      }
      setModalAberto(false);
      await carregar();
    } catch (e: unknown) {
      setErroForm(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function desativar() {
    if (!confirmDesativar) return;
    try {
      await inspetoresApi.desativar(confirmDesativar.id);
      toast(`${confirmDesativar.nome} desativado.`);
      setConfirmDesativar(null);
      await carregar();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao desativar.", "erro");
    }
  }

  async function reativar(i: Inspetor) {
    try {
      await inspetoresApi.atualizar(i.id, { ativo: true });
      toast(`${i.nome} reativado.`);
      await carregar();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao reativar.", "erro");
    }
  }

  const ativos   = inspetores.filter((i) => i.ativo);
  const inativos = inspetores.filter((i) => !i.ativo);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Inspetores</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {!carregando && `${ativos.length} inspetor${ativos.length !== 1 ? "es" : ""} autorizado${ativos.length !== 1 ? "s" : ""} a enviar fotos via WhatsApp.`}
          </p>
        </div>
        <button onClick={abrirNovo} className="btn-primary sm:w-auto w-full">
          <Plus className="w-4 h-4" /> Novo inspetor
        </button>
      </div>

      {/* Info banner */}
      <div className="card p-4 flex items-start gap-3 bg-sky-50 border-sky-200">
        <Phone className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
        <p className="text-sm text-sky-800">
          Somente números cadastrados aqui podem enviar fotos de extintores via WhatsApp.
          O número deve ser o mesmo que envia as mensagens — inclua o DDI (ex: <strong>5577777777777</strong>).
        </p>
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
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="skeleton w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-36" />
                <div className="skeleton h-3 w-28" />
              </div>
              <div className="skeleton h-8 w-20 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!carregando && inspetores.length === 0 && !erro && (
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <HardHat className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">Nenhum inspetor cadastrado ainda.</p>
          <p className="text-xs text-gray-400 mt-1">
            Cadastre o número de quem vai enviar as fotos via WhatsApp.
          </p>
          <button onClick={abrirNovo} className="btn-primary btn-sm mt-4 mx-auto">
            <Plus className="w-3.5 h-3.5" /> Cadastrar primeiro inspetor
          </button>
        </div>
      )}

      {/* Active inspectors */}
      {!carregando && ativos.length > 0 && (
        <section>
          <h2 className="section-title mb-3">Ativos ({ativos.length})</h2>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {ativos.map((i) => (
                <li key={i.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center font-bold text-sky-700 text-sm shrink-0">
                    {i.nome.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{i.nome}</span>
                      <span className="badge-green"><CheckCircle2 className="w-3 h-3" /> Autorizado</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{i.telefone}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <span className="font-medium">Unidade:</span> {i.unidade || <span className="text-amber-600">não definida</span>}
                    </p>
                    <p className="text-xs text-gray-300 mt-0.5">Desde {formatarData(i.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => abrirEditar(i)}
                      className="btn-icon w-8 h-8"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDesativar(i)}
                      className="btn-icon w-8 h-8 hover:bg-red-50 hover:text-red-600"
                      title="Desativar"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Inactive inspectors */}
      {!carregando && inativos.length > 0 && (
        <section>
          <h2 className="section-title mb-3 text-gray-400">Inativos ({inativos.length})</h2>
          <div className="card overflow-hidden opacity-70">
            <ul className="divide-y divide-gray-100">
              {inativos.map((i) => (
                <li key={i.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-400 text-sm shrink-0">
                    {i.nome.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-500">{i.nome}</span>
                      <span className="badge-gray">Inativo</span>
                    </div>
                    <p className="text-xs text-gray-300 mt-0.5 font-mono">{i.telefone}</p>
                  </div>
                  <button
                    onClick={() => reativar(i)}
                    className="btn-ghost btn-sm text-green-600 hover:bg-green-50 shrink-0"
                    title="Reativar"
                  >
                    <UserCheck className="w-4 h-4" /> Reativar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={modalAberto}
        titulo={editando ? `Editar inspetor — ${editando.nome}` : "Novo inspetor"}
        onClose={() => { if (!salvando) setModalAberto(false); }}
        largura="max-w-md"
      >
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label htmlFor="nome-inspetor" className="label">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              id="nome-inspetor"
              type="text"
              required
              minLength={2}
              className="input"
              placeholder="Nome completo"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="tel-inspetor" className="label">
              Telefone WhatsApp <span className="text-red-500">*</span>
            </label>
            <input
              id="tel-inspetor"
              type="tel"
              required
              className="input font-mono"
              placeholder="5577777777777"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
            <p className="field-hint">
              Inclua o DDI 55 + DDD + número. Somente dígitos ou com espaços/hífens.
            </p>
          </div>

          <div>
            <label htmlFor="unidade-inspetor" className="label">
              Unidade <span className="text-red-500">*</span>
            </label>
            <input
              id="unidade-inspetor"
              type="text"
              required
              minLength={1}
              className="input"
              placeholder="Ex.: Barry Callebaut"
              value={form.unidade}
              onChange={(e) => setForm({ ...form, unidade: e.target.value })}
            />
            <p className="field-hint">
              Unidade que este inspetor cobre. Todas as fotos enviadas por ele
              serão atribuídas automaticamente a esta unidade.
            </p>
          </div>

          {erroForm && (
            <div className="flex items-center gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{erroForm}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setModalAberto(false)}
              disabled={salvando}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-primary flex-1">
              {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm deactivate */}
      <Modal
        open={!!confirmDesativar}
        titulo="Desativar inspetor"
        onClose={() => setConfirmDesativar(null)}
        largura="max-w-sm"
      >
        <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Desativar <strong>{confirmDesativar?.nome}</strong>? O número
            &nbsp;<span className="font-mono">{confirmDesativar?.telefone}</span>&nbsp;
            não terá mais permissão para enviar fotos via WhatsApp.
            O histórico de inspeções é preservado.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setConfirmDesativar(null)} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button onClick={desativar} className="btn-danger flex-1">
            <UserMinus className="w-4 h-4" /> Desativar
          </button>
        </div>
      </Modal>
    </div>
  );
}
