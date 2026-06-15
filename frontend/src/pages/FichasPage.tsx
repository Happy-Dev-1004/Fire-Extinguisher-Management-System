import { useState, useEffect } from "react";
import { fichaApi, relatorioApi, regioesApi } from "../lib/api";
import type { DestinatarioResolvido, ResultadoEnvioMulti } from "../lib/types";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import {
  FileText, Send, Download, Loader2, CheckCircle2,
  AlertTriangle, MapPin, CalendarDays, MessageCircle, Mail, Eye, X,
} from "lucide-react";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function mesAtual(): string {
  const d = new Date();
  return `${MESES[d.getMonth()]}/${d.getFullYear()}`;
}

export function FichasPage() {
  const [unidades, setUnidades]     = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Send modal state
  const [modalEnvio, setModalEnvio]                   = useState(false);
  const [unidadeSelecionada, setUnidadeSelecionada]   = useState("");
  const [mes, setMes]                                 = useState(mesAtual);
  const [preview, setPreview]                         = useState<DestinatarioResolvido[]>([]);
  const [carregandoPreview, setCarregandoPreview]     = useState(false);
  const [enviando, setEnviando]                       = useState(false);
  const [resultado, setResultado]                     = useState<{
    enviados: number; falhas: number; detalhes: ResultadoEnvioMulti[];
  } | null>(null);

  // Download / preview state
  const [baixando, setBaixando]   = useState<string | null>(null); // unidade being downloaded
  const [previewando, setPreviewando] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);
  const [previewUnidade, setPreviewUnidade] = useState("");

  useEffect(() => {
    void carregarUnidades();
  }, []);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function carregarUnidades() {
    setCarregando(true);
    try {
      // Regions are the units. Use the regions endpoint directly (cheaper than
      // loading every extinguisher just to extract the names).
      const { regioes } = await regioesApi.listar();
      setUnidades(regioes.map((r) => r.nome));
    } catch {
      toast("Erro ao carregar regiões.", "erro");
    } finally {
      setCarregando(false);
    }
  }

  async function abrirPreview(unidade: string) {
    setPreviewando(unidade);
    try {
      const url = await relatorioApi.regiaoPreview(unidade);
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

  async function abrirEnvio(unidade: string) {
    setUnidadeSelecionada(unidade);
    setMes(mesAtual());
    setPreview([]);
    setResultado(null);
    setModalEnvio(true);
    setCarregandoPreview(true);
    try {
      const r = await fichaApi.previewDestinatarios(unidade);
      setPreview(r.destinatarios);
    } catch {
      toast("Erro ao carregar destinatários.", "erro");
    } finally {
      setCarregandoPreview(false);
    }
  }

  async function confirmarEnvio(canal: "whatsapp" | "email" | "ambos") {
    setEnviando(true);
    try {
      const r = await fichaApi.enviar(unidadeSelecionada, mes, canal);
      setResultado({ enviados: r.enviados, falhas: r.falhas, detalhes: r.detalhes });
      toast(
        r.falhas === 0
          ? `Ficha enviada para ${r.enviados} destinatário(s).`
          : `${r.enviados} enviados, ${r.falhas} falha(s).`,
        r.falhas === 0 ? "sucesso" : "info",
      );
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Erro ao enviar ficha.", "erro");
    } finally {
      setEnviando(false);
    }
  }

  async function baixarPDF(unidade: string) {
    setBaixando(unidade);
    try {
      // Use the regional ficha-format report (same as preview), not the legacy
      // unit+month ficha, so download and preview always match.
      await relatorioApi.regiao(unidade, "pdf");
      toast("PDF baixado com sucesso.");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Erro ao baixar PDF.", "erro");
    } finally {
      setBaixando(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">Fichas de Inspeção</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gere e envie as fichas mensais por unidade via WhatsApp ou e-mail.
        </p>
      </div>

      {/* Current month banner */}
      <div className="card p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <CalendarDays className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Mês atual: {mesAtual()}</p>
          <p className="text-xs text-gray-400">
            Use os botões abaixo para baixar o PDF ou enviar (WhatsApp / e-mail) para cada unidade.
          </p>
        </div>
      </div>

      {/* Skeleton */}
      {carregando && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
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
          <p className="text-sm font-medium text-gray-500">Nenhuma unidade encontrada.</p>
          <p className="text-xs text-gray-400 mt-1">
            As fichas aparecem aqui automaticamente após os inspetores enviarem fotos via WhatsApp.
          </p>
        </div>
      )}

      {/* Unit cards */}
      {!carregando && unidades.length > 0 && (
        <div className="space-y-3">
          {unidades.map((unidade) => (
            <div key={unidade} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{unidade}</p>
                  <p className="text-xs text-gray-400">{mesAtual()}</p>
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                {/* Preview report (sample ficha format) */}
                <button
                  onClick={() => abrirPreview(unidade)}
                  disabled={previewando === unidade}
                  className="btn-secondary btn-sm"
                  title="Pré-visualizar relatório"
                >
                  {previewando === unidade ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  Pré-visualizar
                </button>

                {/* Download PDF */}
                <button
                  onClick={() => baixarPDF(unidade)}
                  disabled={baixando === unidade}
                  className="btn-secondary btn-sm"
                  title="Baixar PDF da ficha"
                >
                  {baixando === unidade ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Baixar PDF
                </button>

                {/* Send via WhatsApp */}
                <button
                  onClick={() => abrirEnvio(unidade)}
                  className="btn-primary btn-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  Enviar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Send modal */}
      <Modal
        open={modalEnvio}
        titulo={`Enviar ficha — ${unidadeSelecionada}`}
        onClose={() => { if (!enviando) setModalEnvio(false); }}
        largura="max-w-md"
      >
        {resultado ? (
          <div className="space-y-4">
            <div className={`flex items-center gap-2.5 p-3.5 rounded-xl border ${
              resultado.falhas === 0
                ? "bg-green-50 border-green-200"
                : "bg-amber-50 border-amber-200"
            }`}>
              {resultado.falhas === 0
                ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              }
              <p className={`text-sm font-medium ${resultado.falhas === 0 ? "text-green-800" : "text-amber-800"}`}>
                {resultado.falhas === 0
                  ? `Ficha enviada para ${resultado.enviados} destinatário(s).`
                  : `${resultado.enviados} enviados, ${resultado.falhas} falha(s).`}
              </p>
            </div>
            <div className="card overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {resultado.detalhes.map((r) => (
                  <li key={r.destinatario.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-800 truncate mb-1.5">{r.destinatario.nome}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.whatsapp.tentado && (
                        r.whatsapp.ok
                          ? <span className="badge-green"><MessageCircle className="w-3 h-3" /> WhatsApp ✓</span>
                          : <span className="badge-red" title={r.whatsapp.motivo}><MessageCircle className="w-3 h-3" /> WhatsApp ✗</span>
                      )}
                      {r.email.tentado && (
                        r.email.ok
                          ? <span className="badge-green"><Mail className="w-3 h-3" /> E-mail ✓</span>
                          : <span className="badge-red" title={r.email.motivo}><Mail className="w-3 h-3" /> E-mail ✗</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={() => setModalEnvio(false)} className="btn-primary w-full">
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">Mês de referência</label>
              <input
                type="text"
                required
                className="input"
                placeholder="Ex: Junho/2026"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              />
            </div>

            <div>
              <p className="section-title mb-2">Destinatários</p>
              {carregandoPreview ? (
                <div className="flex items-center gap-2 py-3 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
                </div>
              ) : preview.length === 0 ? (
                <div className="flex items-center gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">
                    Nenhum destinatário ativo para esta unidade.
                    <br />
                    <span className="text-xs">Cadastre destinatários em <strong>Destinatários</strong> antes de enviar.</span>
                  </p>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <ul className="divide-y divide-gray-100">
                    {preview.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <p className="text-sm font-medium text-gray-800">{d.nome}</p>
                        <p className="text-xs text-gray-400">{d.telefone}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Channel picker — choose how to send the ficha */}
            <div className="pt-1">
              <p className="section-title mb-2">Como deseja enviar?</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => confirmarEnvio("whatsapp")}
                  disabled={enviando || preview.length === 0 || carregandoPreview}
                  className="btn-secondary"
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => confirmarEnvio("email")}
                  disabled={enviando || preview.length === 0 || carregandoPreview}
                  className="btn-secondary"
                >
                  <Mail className="w-4 h-4" /> E-mail
                </button>
                <button
                  type="button"
                  onClick={() => confirmarEnvio("ambos")}
                  disabled={enviando || preview.length === 0 || carregandoPreview}
                  className="btn-primary"
                >
                  {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Ambos
                </button>
              </div>
              <button
                type="button"
                onClick={() => setModalEnvio(false)}
                disabled={enviando}
                className="btn-secondary w-full mt-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Report preview overlay (sample ficha format) */}
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
            title="Pré-visualização do relatório"
            src={previewUrl}
            className="flex-1 w-full rounded-lg bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

