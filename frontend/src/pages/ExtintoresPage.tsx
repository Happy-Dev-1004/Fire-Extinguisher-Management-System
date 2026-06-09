import { useState, useEffect, type FormEvent } from "react";
import { extintoresApi } from "../lib/api";
import type { Extintor } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import { formatarDataHora } from "../lib/formatters";

type FormData = {
  numero: string;
  unidade: string;
  setor: string;
  tipo_carga: string;
  capacidade: string;
  vencimento_carga: string;
  vencimento_teste: string;
};

const FORM_VAZIO: FormData = {
  numero: "", unidade: "", setor: "", tipo_carga: "",
  capacidade: "", vencimento_carga: "", vencimento_teste: "",
};

export function ExtintoresPage() {
  const [extintores, setExtintores]     = useState<Extintor[]>([]);
  const [carregando, setCarregando]     = useState(true);
  const [erro, setErro]                 = useState("");
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [modalAberto, setModalAberto]   = useState(false);
  const [editando, setEditando]         = useState<Extintor | null>(null);
  const [form, setForm]                 = useState<FormData>(FORM_VAZIO);
  const [salvando, setSalvando]         = useState(false);
  const [confirmExcluir, setConfirmExcluir] = useState<Extintor | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setErro("");
    try {
      const dados = await extintoresApi.listar(filtroUnidade || undefined);
      setExtintores(dados);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar extintores.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, [filtroUnidade]);

  const abrirNovo = () => {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  };

  const abrirEditar = (e: Extintor) => {
    setEditando(e);
    setForm({
      numero:           e.numero,
      unidade:          e.unidade,
      setor:            e.setor,
      tipo_carga:       e.tipo_carga,
      capacidade:       e.capacidade ?? "",
      vencimento_carga: e.vencimento_carga ?? "",
      vencimento_teste: e.vencimento_teste ?? "",
    });
    setModalAberto(true);
  };

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setSalvando(true);
    try {
      const payload = {
        numero:           form.numero.trim(),
        unidade:          form.unidade.trim(),
        setor:            form.setor.trim(),
        tipo_carga:       form.tipo_carga.trim(),
        capacidade:       form.capacidade.trim() || null,
        vencimento_carga: form.vencimento_carga.trim() || null,
        vencimento_teste: form.vencimento_teste.trim() || null,
      };

      if (editando) {
        await extintoresApi.atualizar(editando.id, payload);
        toast("Extintor atualizado com sucesso.");
      } else {
        await extintoresApi.criar(payload as Parameters<typeof extintoresApi.criar>[0]);
        toast("Extintor cadastrado com sucesso.");
      }
      setModalAberto(false);
      void carregar();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao salvar.", "erro");
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async () => {
    if (!confirmExcluir) return;
    try {
      await extintoresApi.excluir(confirmExcluir.id);
      toast("Extintor removido.");
      setConfirmExcluir(null);
      void carregar();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Erro ao remover.", "erro");
    }
  };

  const campo = (
    id: keyof FormData,
    label: string,
    obrigatorio = false,
    placeholder = ""
  ) => (
    <div>
      <label htmlFor={id} className="label">
        {label}{obrigatorio && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        id={id}
        className="input"
        value={form[id]}
        placeholder={placeholder}
        required={obrigatorio}
        onChange={(e) => setForm((p) => ({ ...p, [id]: e.target.value }))}
      />
    </div>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="page-title">Extintores</h1>
        <button onClick={abrirNovo} className="btn-primary sm:w-auto w-full">
          + Novo extintor
        </button>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <input
          className="input max-w-xs"
          placeholder="Filtrar por unidade…"
          value={filtroUnidade}
          onChange={(e) => setFiltroUnidade(e.target.value)}
        />
      </div>

      {/* Error */}
      {erro && (
        <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
          {erro}
        </div>
      )}

      {/* Loading */}
      {carregando && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      )}

      {/* Table */}
      {!carregando && extintores.length === 0 && !erro && (
        <div className="card p-10 text-center text-gray-400">
          <div className="text-4xl mb-2">🧯</div>
          <p className="text-sm">Nenhum extintor cadastrado.</p>
        </div>
      )}

      {!carregando && extintores.length > 0 && (
        <div className="card overflow-hidden">
          {/* Horizontally scrollable on mobile */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {["Nº", "Unidade", "Setor", "Tipo de carga", "Venc. carga", "Venc. teste", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {extintores.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{e.numero}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.unidade}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.setor}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.tipo_carga}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {e.vencimento_carga ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {e.vencimento_teste ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => abrirEditar(e)}
                          className="btn-secondary btn-sm"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setConfirmExcluir(e)}
                          className="btn-danger btn-sm"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            {extintores.length} extintor{extintores.length !== 1 ? "es" : ""}
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={modalAberto}
        titulo={editando ? `Editar extintor ${editando.numero}` : "Novo extintor"}
        onClose={() => setModalAberto(false)}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {campo("numero",    "Número",       true,  "ex: 01")}
            {campo("unidade",   "Unidade",      true,  "ex: Matriz")}
            {campo("setor",     "Setor",        true,  "ex: Recepção")}
            {campo("tipo_carga","Tipo de carga",true,  "ex: ABC 06 KG")}
            {campo("capacidade","Capacidade",   false, "ex: 6 KG")}
            {campo("vencimento_carga","Venc. carga", false, "ex: nov/26")}
            {campo("vencimento_teste","Venc. teste", false, "ex: mar/28")}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModalAberto(false)} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-primary flex-1">
              {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm delete modal */}
      <Modal
        open={!!confirmExcluir}
        titulo="Confirmar exclusão"
        onClose={() => setConfirmExcluir(null)}
        largura="max-w-sm"
      >
        <p className="text-sm text-gray-700 mb-4">
          Tem certeza que deseja excluir o extintor{" "}
          <strong>{confirmExcluir?.numero}</strong> — {confirmExcluir?.unidade}?
          <br />
          <span className="text-red-600 text-xs">
            Todas as inspeções relacionadas também serão removidas.
          </span>
        </p>
        <div className="flex gap-3">
          <button onClick={() => setConfirmExcluir(null)} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button onClick={handleExcluir} className="btn-danger flex-1">
            Excluir
          </button>
        </div>
      </Modal>

      {/* Toast container lives here so it's always mounted */}
      {/* (imported globally in main via Shell) */}
    </div>
  );
}

// suppress unused import warning — formatarDataHora used in future date columns
void formatarDataHora;
