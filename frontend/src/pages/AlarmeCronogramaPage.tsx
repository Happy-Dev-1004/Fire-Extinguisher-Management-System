import { useEffect, useState, useCallback } from "react";
import { alarmeApi, type AreaCronograma, type ResumoAreaFabrica, type SituacaoCronograma } from "../lib/api";
import { toast } from "../components/Toast";
import {
  CalendarClock, Loader2, CheckCircle2, Clock, AlertTriangle, HelpCircle, Save,
  FileText, Download, Eye, X, PieChart,
} from "lucide-react";

const SIT_META: Record<SituacaoCronograma, { label: string; badge: string; Icon: React.ElementType }> = {
  concluido: { label: "Concluído",   badge: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300", Icon: CheckCircle2 },
  no_prazo:  { label: "No prazo",    badge: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300",     Icon: Clock },
  atrasado:  { label: "Atrasado",    badge: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",         Icon: AlertTriangle },
  sem_data:  { label: "Sem data",    badge: "bg-gray-100 text-gray-500 dark:bg-gray-700/40 dark:text-gray-300",     Icon: HelpCircle },
};

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// 1.5 → "1,5%" (vírgula decimal, sem zeros sobrando).
function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${String(Number(n.toFixed(3))).replace(".", ",")}%`;
}

// Campos editáveis de uma linha do cronograma. O rascunho guarda tudo como
// string (é o que os <input> devolvem) e converte só na hora de salvar.
interface Rascunho {
  pct_area: string;
  data_inicio_prevista: string;
  data_entrega_prevista: string;
  data_inicio_real: string;
  data_fim_real: string;
}

function rascunhoDe(a: AreaCronograma): Rascunho {
  return {
    pct_area: a.pct_area === null ? "" : String(a.pct_area).replace(".", ","),
    data_inicio_prevista:  a.data_inicio_prevista  ?? "",
    data_entrega_prevista: a.data_entrega_prevista ?? "",
    data_inicio_real:      a.data_inicio_real      ?? "",
    data_fim_real:         a.data_fim_real         ?? "",
  };
}

// Aceita "1,5" ou "1.5"; devolve null quando vazio e undefined quando inválido
// (o undefined sinaliza "não salve isto", em vez de apagar o valor existente).
function parsePct(txt: string): number | null | undefined {
  const t = txt.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

// Duração em dias corridos entre duas datas ISO, contando o primeiro e o último
// dia. Espelha diasEntre() do backend, para a tela não esperar o save pra mostrar.
function duracaoDias(inicio: string, fim: string): number | null {
  if (!inicio || !fim) return null;
  const a = Date.parse(inicio + "T00:00:00Z");
  const b = Date.parse(fim + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

// Fase 2 · Cronograma — execution schedule per área (central + setor): target
// delivery date + live install progress + on-track/late status.
export function AlarmeCronogramaPage() {
  const [areas, setAreas] = useState<AreaCronograma[]>([]);
  const [resumoArea, setResumoArea] = useState<ResumoAreaFabrica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null);
  // Local edits to the row inputs, keyed by central_id|setor.
  const [rascunho, setRascunho] = useState<Record<string, Rascunho>>({});

  // PDF export state
  const [baixando, setBaixando]     = useState(false);
  const [previewando, setPreviewando] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const keyDe = (a: AreaCronograma) => `${a.central_id}|${a.setor}`;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await alarmeApi.cronograma();
      setAreas(r.areas);
      setResumoArea(r.resumo_area);
      setRascunho(Object.fromEntries(r.areas.map((a) => [keyDe(a), rascunhoDe(a)])));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar o cronograma.", "erro");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function baixarPDF() {
    setBaixando(true);
    try {
      await alarmeApi.baixarCronograma();
      toast("PDF do cronograma baixado.", "sucesso");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao baixar o PDF.", "erro");
    } finally {
      setBaixando(false);
    }
  }

  async function abrirPreview() {
    setPreviewando(true);
    try {
      const url = await alarmeApi.cronogramaPreview();
      setPreviewUrl(url);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao gerar a pré-visualização.", "erro");
    } finally {
      setPreviewando(false);
    }
  }

  function fecharPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function salvar(a: AreaCronograma) {
    const k = keyDe(a);
    const r = rascunho[k];
    if (!r) return;

    const pct = parsePct(r.pct_area);
    if (pct === undefined) {
      toast("Percentual da área inválido. Use um número entre 0 e 100 (ex.: 1,5).", "erro");
      return;
    }
    // Datas invertidas geram duração negativa — barra aqui, com uma mensagem
    // clara, em vez de deixar a coluna Duração silenciosamente vazia.
    if (r.data_inicio_prevista && r.data_entrega_prevista && r.data_entrega_prevista < r.data_inicio_prevista) {
      toast("A entrega prevista não pode ser anterior ao início previsto.", "erro");
      return;
    }
    if (r.data_inicio_real && r.data_fim_real && r.data_fim_real < r.data_inicio_real) {
      toast("A data real de fim não pode ser anterior ao início real.", "erro");
      return;
    }

    setSalvandoKey(k);
    try {
      await alarmeApi.definirCronograma({
        central_id: a.central_id, setor: a.setor,
        pct_area: pct,
        data_inicio_prevista:  r.data_inicio_prevista  || null,
        data_entrega_prevista: r.data_entrega_prevista || null,
        data_inicio_real:      r.data_inicio_real      || null,
        data_fim_real:         r.data_fim_real         || null,
      });
      toast(`${a.setor || "Área"} atualizada.`, "sucesso");
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar.", "erro");
    } finally {
      setSalvandoKey(null);
    }
  }

  function editar(k: string, campo: keyof Rascunho, valor: string) {
    setRascunho((r) => ({ ...r, [k]: { ...r[k], [campo]: valor } }));
  }

  // Alterado = qualquer campo da linha difere do que está salvo.
  function alterado(a: AreaCronograma): boolean {
    const r = rascunho[keyDe(a)];
    if (!r) return false;
    const orig = rascunhoDe(a);
    return (Object.keys(orig) as Array<keyof Rascunho>).some((c) => r[c] !== orig[c]);
  }

  // "Sistema antigo?" saves immediately on change (Sim/Não/em branco).
  async function salvarSistemaAntigo(a: AreaCronograma, valor: boolean | null) {
    // optimistic update so the dropdown reflects the choice at once
    setAreas((prev) => prev.map((x) => (x.central_id === a.central_id && x.setor === a.setor ? { ...x, sistema_antigo: valor } : x)));
    try {
      await alarmeApi.definirCronograma({ central_id: a.central_id, setor: a.setor, sistema_antigo: valor });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar.", "erro");
      await carregar(); // revert on failure
    }
  }

  // Rollup counters for the header.
  const totalAreas = areas.length;
  const atrasadas = areas.filter((a) => a.situacao === "atrasado").length;
  const concluidas = areas.filter((a) => a.situacao === "concluido").length;

  // Group areas by central for readable sections.
  const porCentral = new Map<string, AreaCronograma[]>();
  for (const a of areas) {
    const label = `Central ${a.central_numero ?? "?"}${a.central_nome ? ` · ${a.central_nome}` : ""}`;
    (porCentral.get(label) ?? porCentral.set(label, []).get(label)!).push(a);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-brand-600" /> Cronograma de Execução
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Defina o percentual da área, as datas previstas e reais por área, e acompanhe o andamento da instalação (entregue = testado).
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={abrirPreview} disabled={previewando || carregando} className="btn-secondary btn-sm" title="Pré-visualizar o PDF">
            {previewando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />} Pré-visualizar
          </button>
          <button onClick={baixarPDF} disabled={baixando || carregando} className="btn-primary btn-sm" title="Baixar o cronograma em PDF">
            {baixando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Baixar PDF
          </button>
        </div>
      </div>

      {/* Rollup */}
      {!carregando && totalAreas > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card p-4"><p className="text-2xl font-bold text-gray-900">{totalAreas}</p><p className="text-xs text-gray-500">áreas</p></div>
          <div className="card p-4"><p className="text-2xl font-bold text-green-700">{concluidas}</p><p className="text-xs text-gray-500">concluídas</p></div>
          <div className="card p-4"><p className={`text-2xl font-bold ${atrasadas > 0 ? "text-red-700" : "text-gray-900"}`}>{atrasadas}</p><p className="text-xs text-gray-500">atrasadas</p></div>
          <div className="card p-4">
            <p className="text-2xl font-bold text-blue-700 flex items-center gap-1.5">
              <PieChart className="w-4 h-4 shrink-0" /> {fmtPct(resumoArea?.pct_atendido ?? 0)}
            </p>
            <p className="text-xs text-gray-500">
              da área da fábrica atendida
              {resumoArea && resumoArea.areas_com_pct > 0 && (
                <span className="block text-[10px] text-gray-400">
                  {fmtPct(resumoArea.pct_cadastrado)} cadastrada em {resumoArea.areas_com_pct} área(s)
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 py-8 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
      ) : areas.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <CalendarClock className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm">Nenhuma área encontrada. Cadastre/importe os dispositivos primeiro.</p>
        </div>
      ) : (
        Array.from(porCentral.entries()).map(([central, lista]) => (
          <div key={central} className="space-y-2">
            <p className="section-title">{central}</p>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-th coluna-fixa !bg-gray-50 dark:!bg-gray-800" rowSpan={2}>Área (setor)</th>
                      <th className="table-th whitespace-nowrap" rowSpan={2} title="Quanto esta área representa da área total da fábrica">% da área</th>
                      <th className="table-th whitespace-nowrap" rowSpan={2}>Sistema antigo?</th>
                      <th className="table-th" rowSpan={2}>Progresso</th>
                      <th className="table-th text-center border-l border-gray-200 dark:border-gray-700" colSpan={3}>Previsto</th>
                      <th className="table-th text-center border-l border-gray-200 dark:border-gray-700" colSpan={3}>Realizado</th>
                      <th className="table-th border-l border-gray-200 dark:border-gray-700" rowSpan={2}>Situação</th>
                      <th className="table-th w-8" rowSpan={2}></th>
                    </tr>
                    <tr>
                      <th className="table-th whitespace-nowrap border-l border-gray-200 dark:border-gray-700">Início</th>
                      <th className="table-th whitespace-nowrap">Entrega</th>
                      <th className="table-th whitespace-nowrap">Duração</th>
                      <th className="table-th whitespace-nowrap border-l border-gray-200 dark:border-gray-700">Início real</th>
                      <th className="table-th whitespace-nowrap">Fim real</th>
                      <th className="table-th whitespace-nowrap">Duração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((a) => {
                      const k = keyDe(a);
                      const meta = SIT_META[a.situacao];
                      const r = rascunho[k] ?? rascunhoDe(a);
                      const temAlteracao = alterado(a);
                      // Durações recalculadas a partir do rascunho, para o número
                      // acompanhar a digitação antes mesmo de salvar.
                      const durPrev = duracaoDias(r.data_inicio_prevista, r.data_entrega_prevista);
                      const durReal = duracaoDias(r.data_inicio_real, r.data_fim_real);
                      const atrasado = a.situacao === "atrasado";
                      // A célula fixa precisa repetir o fundo da linha: sendo sticky ela
                      // fica por cima das outras e um fundo transparente deixaria o
                      // conteúdo rolando aparecer por baixo.
                      const fundoCelulaFixa = atrasado
                        ? "!bg-red-50 dark:!bg-[#2b1a1c]"
                        : "!bg-white dark:!bg-gray-900";
                      return (
                        <tr key={k} className={`table-row ${atrasado ? "bg-red-50/60 dark:bg-red-500/10" : ""}`}>
                          {/* Coluna fixa: o nome da área continua visível ao rolar as 12
                              colunas, e nomes longos quebram em linha em vez de invadir
                              a coluna seguinte. */}
                          <td className={`table-td font-medium text-gray-800 coluna-fixa ${fundoCelulaFixa}`}>
                            {a.setor || "—"}
                          </td>
                          <td className="table-td">
                            <input
                              type="text" inputMode="decimal"
                              className="input py-1 text-sm w-[76px] text-right"
                              placeholder="—"
                              value={r.pct_area}
                              onChange={(e) => editar(k, "pct_area", e.target.value)}
                              title="Quanto esta área representa da área total da fábrica (ex.: 1,5)"
                            />
                          </td>
                          <td className="table-td">
                            <select
                              className="input py-1 text-sm w-[90px]"
                              value={a.sistema_antigo === true ? "sim" : a.sistema_antigo === false ? "nao" : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                salvarSistemaAntigo(a, v === "sim" ? true : v === "nao" ? false : null);
                              }}
                              title="Esta área já possui equipamento instalado no sistema antigo?"
                            >
                              <option value="">—</option>
                              <option value="sim">Sim</option>
                              <option value="nao">Não</option>
                            </select>
                          </td>
                          <td className="table-td min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: `${a.pct}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap">{a.concluidos}/{a.total}</span>
                            </div>
                          </td>

                          {/* Previsto */}
                          <td className="table-td border-l border-gray-200 dark:border-gray-700">
                            <input type="date" className="input py-1 text-sm w-[132px]"
                              value={r.data_inicio_prevista}
                              onChange={(e) => editar(k, "data_inicio_prevista", e.target.value)} />
                          </td>
                          <td className="table-td">
                            <input type="date" className="input py-1 text-sm w-[132px]"
                              value={r.data_entrega_prevista}
                              onChange={(e) => editar(k, "data_entrega_prevista", e.target.value)} />
                          </td>
                          <td className="table-td text-center text-xs text-gray-500 whitespace-nowrap">
                            {durPrev === null ? "—" : `${durPrev} d`}
                          </td>

                          {/* Realizado */}
                          <td className="table-td border-l border-gray-200 dark:border-gray-700">
                            <input type="date" className="input py-1 text-sm w-[132px]"
                              value={r.data_inicio_real}
                              onChange={(e) => editar(k, "data_inicio_real", e.target.value)} />
                          </td>
                          <td className="table-td">
                            <input type="date" className="input py-1 text-sm w-[132px]"
                              value={r.data_fim_real}
                              onChange={(e) => editar(k, "data_fim_real", e.target.value)} />
                          </td>
                          <td className="table-td text-center text-xs text-gray-500 whitespace-nowrap">
                            {durReal === null ? "—" : `${durReal} d`}
                          </td>

                          <td className="table-td border-l border-gray-200 dark:border-gray-700">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                              <meta.Icon className="w-3 h-3" /> {meta.label}
                            </span>
                            {a.data_entrega_prevista && a.situacao !== "concluido" && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">alvo: {fmtData(a.data_entrega_prevista)}</span>
                            )}
                          </td>
                          <td className="table-td">
                            {temAlteracao && (
                              <button onClick={() => salvar(a)} disabled={salvandoKey === k} title="Salvar alterações da área" className="btn-primary btn-sm p-1.5">
                                {salvandoKey === k ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))
      )}

      {/* PDF preview overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col p-3 sm:p-6 animate-fade-in" onClick={fecharPreview}>
          <div className="flex items-center justify-between mb-2 text-white">
            <p className="text-sm font-medium">Pré-visualização — Cronograma de Execução</p>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button onClick={baixarPDF} className="btn-secondary btn-sm">
                <Download className="w-3.5 h-3.5" /> Baixar PDF
              </button>
              <button onClick={fecharPreview} className="btn-secondary btn-sm">
                <X className="w-3.5 h-3.5" /> Fechar
              </button>
            </div>
          </div>
          <iframe title="Pré-visualização do cronograma" src={previewUrl}
            className="flex-1 w-full rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
