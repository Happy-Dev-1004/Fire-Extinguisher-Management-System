// Renders the alarm execution schedule (cronograma por área) as an official PDF:
// MANSUR + Barry header, grouped by central, each área with target date, install
// progress, and on-track/late status. Mirrors the hydrant-ficha look & feel.

import fs from "fs";
import path from "path";
import { renderPdfFromHtml } from "../pdf/browser";
// Importa do módulo de cálculo puro (não do cronograma.ts, que carrega o
// cliente do Supabase) — assim o PDF pode ser testado sem credenciais.
import { resumirAreaFabrica } from "../alarme/cronogramaCalculo";
import type { AreaCronograma, SituacaoCronograma } from "../alarme/cronogramaCalculo";

function logoBase64(filename: string): string {
  const filePath = path.join(process.cwd(), "assets", filename);
  if (!fs.existsSync(filePath)) return "";
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Duração em dias corridos, já calculada no builder. "12 d" (ou "—").
function fmtDuracao(dias: number | null): string {
  return dias === null ? "—" : `${dias} d`;
}

// Percentual de área com vírgula decimal e sem zeros à toa: 1.5 → "1,5%".
function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${String(Number(n.toFixed(3))).replace(".", ",")}%`;
}

const SIT: Record<SituacaoCronograma, { label: string; bg: string; fg: string }> = {
  concluido: { label: "Concluído", bg: "#dcfce7", fg: "#166534" },
  no_prazo:  { label: "No prazo",  bg: "#dbeafe", fg: "#1e40af" },
  atrasado:  { label: "Atrasado",  bg: "#fee2e2", fg: "#991b1b" },
  sem_data:  { label: "Sem data",  bg: "#f3f4f6", fg: "#6b7280" },
};

// Today (server date) for the "emitido em" stamp.
function hojeBR(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// Builds the report HTML (exported so it can be tested without a browser).
export function renderHtmlCronograma(areas: AreaCronograma[]): string {
  const logoMansur = logoBase64("logo-mansur.png") || logoBase64("logo-mansur.svg");
  const logoBarry  = logoBase64("logo-barry.png")  || logoBase64("logo-barry.svg");

  // Group by central, preserving the incoming (already-sorted) order.
  const porCentral = new Map<string, AreaCronograma[]>();
  for (const a of areas) {
    const label = `CENTRAL ${a.central_numero ?? "?"}${a.central_nome ? ` — ${esc(a.central_nome).toUpperCase()}` : ""}`;
    (porCentral.get(label) ?? porCentral.set(label, []).get(label)!).push(a);
  }

  const totalAreas = areas.length;
  const concluidas = areas.filter((a) => a.situacao === "concluido").length;
  const atrasadas  = areas.filter((a) => a.situacao === "atrasado").length;
  const resumoArea = resumirAreaFabrica(areas);

  const sistemaAntigoTxt = (v: boolean | null) => v === true ? "Sim" : v === false ? "Não" : "—";

  const secoes = Array.from(porCentral.entries()).map(([central, lista]) => {
    const linhas = lista.map((a) => {
      const s = SIT[a.situacao];
      return `
      <tr>
        <td class="setor">${esc(a.setor) || "—"}</td>
        <td class="c">${fmtPct(a.pct_area)}</td>
        <td class="c">${sistemaAntigoTxt(a.sistema_antigo)}</td>
        <td class="c">${a.concluidos}/${a.total}</td>
        <td class="prog">
          <div class="bar"><div class="fill" style="width:${a.pct}%"></div></div>
          <span class="pct">${a.pct}%</span>
        </td>
        <td class="c data">${fmtData(a.data_inicio_prevista)}</td>
        <td class="c data">${fmtData(a.data_entrega_prevista)}</td>
        <td class="c dur">${fmtDuracao(a.duracao_prevista_dias)}</td>
        <td class="c data real">${fmtData(a.data_inicio_real)}</td>
        <td class="c data real">${fmtData(a.data_fim_real)}</td>
        <td class="c dur">${fmtDuracao(a.duracao_real_dias)}</td>
        <td class="c"><span class="badge" style="background:${s.bg};color:${s.fg}">${s.label}</span></td>
      </tr>`;
    }).join("");
    return `
    <div class="secao">
      <div class="secao-titulo">${central}</div>
      <table class="grade">
        <thead>
          <tr>
            <th class="setor" rowspan="2">ÁREA (SETOR)</th>
            <th rowspan="2">% DA<br/>ÁREA</th>
            <th rowspan="2">SISTEMA<br/>ANTIGO?</th>
            <th rowspan="2">ENTREGUES</th>
            <th rowspan="2">PROGRESSO</th>
            <th colspan="3" class="grupo">PREVISTO</th>
            <th colspan="3" class="grupo grupo-real">REALIZADO</th>
            <th rowspan="2">SITUAÇÃO</th>
          </tr>
          <tr>
            <th>INÍCIO</th>
            <th>ENTREGA</th>
            <th>DURAÇÃO</th>
            <th>INÍCIO</th>
            <th>FIM</th>
            <th>DURAÇÃO</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Noto Sans', sans-serif; font-size: 9pt; color: #111; background: #fff; }
  .header { display: flex; align-items: center; justify-content: space-between; border: 2px solid #000; padding: 6px 10px; }
  .header img { height: 46px; width: auto; }
  .header-title { flex: 1; text-align: center; font-size: 14pt; font-weight: bold; line-height: 1.2; padding: 0 10px; letter-spacing: .5px; }
  .subbar { display:flex; justify-content: space-between; align-items:center; border: 2px solid #000; border-top: none; padding: 4px 10px; font-size: 8.5pt; }
  .subbar strong { font-size: 9.5pt; }
  .resumo { display:flex; gap: 8px; margin: 8px 0 10px; }
  .kpi { flex:1; border:1px solid #d1d5db; border-radius:6px; padding:6px 10px; }
  .kpi .n { font-size: 15pt; font-weight: bold; }
  .kpi .l { font-size: 7.5pt; color:#6b7280; text-transform: uppercase; letter-spacing:.5px; }
  .kpi.red .n { color:#991b1b; }
  .kpi.green .n { color:#166534; }
  .kpi.blue .n { color:#1e40af; }
  .secao { margin-bottom: 10px; page-break-inside: avoid; }
  .secao-titulo { background:#111; color:#fff; font-weight:bold; font-size:9pt; padding:4px 8px; letter-spacing:.5px; }
  table.grade { width:100%; border-collapse: collapse; table-layout: fixed; }
  .grade th, .grade td { border:1px solid #cbd5e1; padding:3px 4px; vertical-align: middle; }
  .grade th { background:#f1f5f9; font-size:6.5pt; text-align:center; font-weight:bold; letter-spacing:.2px; }
  /* Cabeçalhos agrupados: PREVISTO (planejado) x REALIZADO (execução real). */
  .grade th.grupo { background:#e2e8f0; font-size:7pt; letter-spacing:.6px; }
  .grade th.grupo-real { background:#dbeafe; }
  .grade td { font-size: 7.5pt; }
  .grade td.c { text-align:center; }
  .grade .setor { text-align:left; width:20%; word-wrap: break-word; }
  .grade .data { font-weight:bold; white-space:nowrap; width:7%; }
  /* Datas reais destacadas do previsto, para leitura rápida na reunião. */
  .grade .real { color:#1e40af; }
  .grade .dur { white-space:nowrap; width:5.5%; color:#374151; }
  .prog { width: 13%; }
  .bar { display:inline-block; width: 70%; height:8px; background:#e5e7eb; border-radius:4px; overflow:hidden; vertical-align:middle; }
  .bar .fill { height:100%; background:#22c55e; }
  .pct { font-size:7.5pt; color:#374151; margin-left:5px; vertical-align: middle; }
  .badge { display:inline-block; padding:1px 7px; border-radius:9px; font-size:7.5pt; font-weight:bold; }
  .vazio { text-align:center; color:#9ca3af; padding:30px; font-style: italic; }
  .rodape { margin-top:10px; font-size:7pt; color:#9ca3af; text-align:center; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>

<div class="header">
  ${logoMansur ? `<img src="${logoMansur}" alt="Mansur"/>` : `<div style="width:100px;font-weight:bold;font-size:13pt">MANSUR</div>`}
  <div class="header-title">CRONOGRAMA DE EXECUÇÃO<br/>SISTEMA DE ALARME DE INCÊNDIO</div>
  ${logoBarry ? `<img src="${logoBarry}" alt="Barry Callebaut"/>` : `<div style="width:120px;font-weight:bold;font-size:9pt;text-align:right">BARRY CALLEBAUT</div>`}
</div>
<div class="subbar">
  <span><strong>Fábrica de Itabuna</strong> — cronograma por área</span>
  <span>Emitido em ${hojeBR()}</span>
</div>

<div class="resumo">
  <div class="kpi"><div class="n">${totalAreas}</div><div class="l">Áreas</div></div>
  <div class="kpi green"><div class="n">${concluidas}</div><div class="l">Concluídas</div></div>
  <div class="kpi red"><div class="n">${atrasadas}</div><div class="l">Atrasadas</div></div>
  <div class="kpi blue">
    <div class="n">${fmtPct(resumoArea.pct_atendido)}</div>
    <div class="l">Área atendida${resumoArea.areas_com_pct > 0 ? ` (de ${fmtPct(resumoArea.pct_cadastrado)} cadastrada)` : ""}</div>
  </div>
</div>

${totalAreas > 0 ? secoes : `<div class="vazio">Nenhuma área cadastrada. Importe/cadastre os dispositivos do alarme primeiro.</div>`}

<div class="rodape">
  Progresso: "entregues" = dispositivos com status TESTADO. "% da área" = quanto a área representa da área total da fábrica;
  a área atendida soma apenas as áreas concluídas. Duração em dias corridos, contando o primeiro e o último dia.
  Documento gerado automaticamente pelo Sistema de Gestão.
</div>

</body></html>`;

  return html;
}

// Paisagem: com 12 colunas (previsto + realizado) a tabela não cabe em retrato.
export async function gerarCronogramaPdf(areas: AreaCronograma[]): Promise<Buffer> {
  return renderPdfFromHtml(renderHtmlCronograma(areas), { landscape: true });
}
