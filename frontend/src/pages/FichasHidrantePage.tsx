import { useState, useEffect } from "react";
import { hidrantesApi } from "../lib/api";
import type { UnidadeHidranteProgresso } from "../lib/types";
import { toast } from "../components/Toast";
import {
  FileText, Download, Loader2, Droplets, CalendarDays, Eye, X,
} from "lucide-react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
function mesAtual(): string {
  const d = new Date();
  return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
}

// Fase 3 · Fichas — the official monthly hydrant ficha per unit (preview + PDF),
// mirroring the Fase 1 Fichas tab. Hydrant fichas are generated on demand from
// the unit's slots; there is no expiry, so the format is the inspection checklist.
export function FichasHidrantePage({ embedded = false }: { embedded?: boolean } = {}) {
  const [unidades, setUnidades]     = useState<UnidadeHidranteProgresso[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [baixando, setBaixando]         = useState<string | null>(null);
  const [previewando, setPreviewando]   = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [previewUnidade, setPreviewUnidade] = useState("");

  useEffect(() => { void carregar(); }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await hidrantesApi.listar();
      setUnidades(r.unidades);
    } catch {
      toast("Erro ao carregar unidades.", "erro");
    } finally {
      setCarregando(false);
    }
  }

  async function abrirPreview(unidade: string) {
    setPreviewando(unidade);
    try {
      const url = await hidrantesApi.fichaPreview(unidade);
      setPreviewUrl(url);
      setPreviewUnidade(unidade);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao gerar pré-visualização.", "erro");
    } finally {
      setPreviewando(null);
    }
  }

  function fecharPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function baixarPDF(unidade: string) {
    setBaixando(unidade);
    try {
      await hidrantesApi.baixarFicha(unidade);
      toast("PDF baixado com sucesso.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao baixar PDF.", "erro");
    } finally {
      setBaixando(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {!embedded && (
        <div>
          <h1 className="page-title">Fichas de Inspeção — Hidrantes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gere a ficha mensal de inspeção dos hidrantes (formato oficial) por unidade.
          </p>
        </div>
      )}

      {/* Current month banner */}
      <div className="card p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
          <CalendarDays className="w-5 h-5 text-sky-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Mês atual: {mesAtual()}</p>
          <p className="text-xs text-gray-400">
            Pré-visualize ou baixe o PDF da <strong>Ficha de Inspeção Mensal dos Hidrantes</strong> de cada unidade.
          </p>
        </div>
      </div>

      {/* Skeleton */}
      {carregando && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 flex items-center gap-4">
              <div className="skeleton w-10 h-10 rounded-xl" />
              <div className="skeleton h-4 w-32" />
              <div className="flex gap-2 ml-auto">
                <div className="skeleton h-8 w-24 rounded-lg" />
                <div className="skeleton h-8 w-28 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!carregando && unidades.length === 0 && (
        <div className="card p-12 text-center border-dashed">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">Nenhuma unidade configurada.</p>
          <p className="text-xs text-gray-400 mt-1">
            Cadastre as unidades em <strong>Hidrantes</strong> e gere o inventário para emitir fichas.
          </p>
        </div>
      )}

      {/* Unit cards */}
      {!carregando && unidades.length > 0 && (
        <div className="space-y-3">
          {unidades.map((u) => (
            <div key={u.nome} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Droplets className="w-5 h-5 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{u.nome}</p>
                  <p className="text-xs text-gray-400">
                    {u.total_esperado} hidrantes · {u.verificado} verificados · {u.aguardando_verificacao} aguardando
                  </p>
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => abrirPreview(u.nome)}
                  disabled={previewando === u.nome}
                  className="btn-secondary btn-sm"
                  title="Pré-visualizar ficha"
                >
                  {previewando === u.nome ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  Pré-visualizar
                </button>
                <button
                  onClick={() => baixarPDF(u.nome)}
                  disabled={baixando === u.nome}
                  className="btn-primary btn-sm"
                  title="Baixar PDF da ficha"
                >
                  {baixando === u.nome ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  Baixar PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ficha PDF preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col p-3 sm:p-6 animate-fade-in" onClick={fecharPreview}>
          <div className="flex items-center justify-between mb-2 text-white">
            <p className="text-sm font-medium">Pré-visualização — {previewUnidade}</p>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => baixarPDF(previewUnidade)} className="btn-secondary btn-sm">
                <Download className="w-3.5 h-3.5" /> Baixar PDF
              </button>
              <button onClick={fecharPreview} className="btn-secondary btn-sm">
                <X className="w-3.5 h-3.5" /> Fechar
              </button>
            </div>
          </div>
          <iframe
            title="Pré-visualização da ficha"
            src={previewUrl}
            className="flex-1 w-full rounded-lg bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
