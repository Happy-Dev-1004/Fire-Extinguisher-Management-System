import { useEffect, useState, useCallback } from "react";
import { alarmeApi, type AreaCronograma, type SituacaoCronograma } from "../lib/api";
import { toast } from "../components/Toast";
import {
  CalendarClock, Loader2, CheckCircle2, Clock, AlertTriangle, HelpCircle, Save,
} from "lucide-react";

const SIT_META: Record<SituacaoCronograma, { label: string; badge: string; Icon: React.ElementType }> = {
  concluido: { label: "Concluído",   badge: "bg-green-100 text-green-800", Icon: CheckCircle2 },
  no_prazo:  { label: "No prazo",    badge: "bg-blue-100 text-blue-800",   Icon: Clock },
  atrasado:  { label: "Atrasado",    badge: "bg-red-100 text-red-800",     Icon: AlertTriangle },
  sem_data:  { label: "Sem data",    badge: "bg-gray-100 text-gray-500",   Icon: HelpCircle },
};

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Fase 2 · Cronograma — execution schedule per área (central + setor): target
// delivery date + live install progress + on-track/late status.
export function AlarmeCronogramaPage() {
  const [areas, setAreas] = useState<AreaCronograma[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null);
  // Local edits to the date inputs, keyed by central_id|setor.
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const keyDe = (a: AreaCronograma) => `${a.central_id}|${a.setor}`;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await alarmeApi.cronograma();
      setAreas(r.areas);
      setRascunho(Object.fromEntries(r.areas.map((a) => [keyDe(a), a.data_prevista ?? ""])));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao carregar o cronograma.", "erro");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar(a: AreaCronograma) {
    const k = keyDe(a);
    const nova = rascunho[k]?.trim() || null;
    setSalvandoKey(k);
    try {
      await alarmeApi.definirCronograma({ central_id: a.central_id, setor: a.setor, data_prevista: nova });
      toast(`Data de ${a.setor} atualizada.`, "sucesso");
      await carregar();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar a data.", "erro");
    } finally {
      setSalvandoKey(null);
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-brand-600" /> Cronograma de Execução
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Defina a data de entrega por área e acompanhe o andamento da instalação (entregue = testado).
        </p>
      </div>

      {/* Rollup */}
      {!carregando && totalAreas > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4"><p className="text-2xl font-bold text-gray-900">{totalAreas}</p><p className="text-xs text-gray-500">áreas</p></div>
          <div className="card p-4"><p className="text-2xl font-bold text-green-700">{concluidas}</p><p className="text-xs text-gray-500">concluídas</p></div>
          <div className="card p-4"><p className={`text-2xl font-bold ${atrasadas > 0 ? "text-red-700" : "text-gray-900"}`}>{atrasadas}</p><p className="text-xs text-gray-500">atrasadas</p></div>
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
                    <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-600">
                      <th className="px-3 py-2">Área (setor)</th>
                      <th className="px-3 py-2">Progresso</th>
                      <th className="px-3 py-2 whitespace-nowrap">Data de entrega</th>
                      <th className="px-3 py-2">Situação</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lista.map((a) => {
                      const k = keyDe(a);
                      const meta = SIT_META[a.situacao];
                      const alterado = (rascunho[k] ?? "") !== (a.data_prevista ?? "");
                      return (
                        <tr key={k} className={a.situacao === "atrasado" ? "bg-red-50/40" : ""}>
                          <td className="px-3 py-2 font-medium text-gray-800 max-w-[240px]">{a.setor || "—"}</td>
                          <td className="px-3 py-2 min-w-[160px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: `${a.pct}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap">{a.concluidos}/{a.total}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              className="input py-1 text-sm w-[150px]"
                              value={rascunho[k] ?? ""}
                              onChange={(e) => setRascunho((r) => ({ ...r, [k]: e.target.value }))}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                              <meta.Icon className="w-3 h-3" /> {meta.label}
                            </span>
                            {a.data_prevista && a.situacao !== "concluido" && (
                              <span className="block text-[10px] text-gray-400 mt-0.5">alvo: {fmtData(a.data_prevista)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {alterado && (
                              <button onClick={() => salvar(a)} disabled={salvandoKey === k} title="Salvar data" className="btn-primary btn-sm p-1.5">
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
    </div>
  );
}
