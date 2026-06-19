// Report builders for alarm-device and RDO searches (CSV + PDF), reusing the
// shared Playwright PDF engine. Same "filter → export" pattern as the
// extinguisher generico report.

import { renderPdfFromHtml } from "../pdf/browser";
import { TIPO_LABEL } from "./expectedBom";
import type { DispositivoBusca } from "./buscaAlarme";

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function csvCell(s: unknown): string {
  const v = s == null ? "" : String(s);
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function dataBR(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// ── Alarm devices ─────────────────────────────────────────────────────────────
const COLS_DISPOSITIVO = [
  "Central", "Laço", "Endereço", "Tipo", "Setor", "Status", "Data instalação", "Cadastro", "Fotos",
];

export function dispositivosParaCsv(rows: DispositivoBusca[]): string {
  const linhas = [COLS_DISPOSITIVO.join(";")];
  for (const r of rows) {
    linhas.push([
      r.central_numero != null ? `Central ${r.central_numero}` : "",
      r.laco ?? "",
      r.endereco ?? "",
      r.tipo_label,
      r.setor ?? "",
      r.status_label,
      dataBR(r.data_instalacao),
      r.cadastro_pendente ? "Incompleto" : "Completo",
      r.qtd_fotos,
    ].map(csvCell).join(";"));
  }
  return "﻿" + linhas.join("\n"); // BOM so Excel reads UTF-8
}

export async function dispositivosParaPdf(
  rows: DispositivoBusca[],
  subtitulo: string
): Promise<Buffer> {
  const corpo = rows.length
    ? rows.map((r) => `
        <tr>
          <td>${r.central_numero != null ? `Central ${r.central_numero}` : "—"}</td>
          <td>${esc(r.laco != null ? String(r.laco) : "—")}</td>
          <td>${esc(r.endereco ?? "—")}</td>
          <td>${esc(r.tipo_label)}</td>
          <td>${esc(r.setor ?? "—")}</td>
          <td><span class="st st-${esc(r.status_instalacao)}">${esc(r.status_label)}</span></td>
          <td>${dataBR(r.data_instalacao) || "—"}</td>
          <td>${r.qtd_fotos}</td>
        </tr>`).join("")
    : `<tr><td colspan="8" class="vazio">Nenhum dispositivo encontrado para os filtros informados.</td></tr>`;

  const html = relatorioHtml(
    "Relatório de dispositivos de alarme",
    subtitulo,
    `<thead><tr>
       <th>Central</th><th>Laço</th><th>Endereço</th><th>Tipo</th><th>Setor</th>
       <th>Status</th><th>Instalação</th><th>Fotos</th>
     </tr></thead><tbody>${corpo}</tbody>`,
    rows.length
  );
  return renderPdfFromHtml(html);
}

// ── RDOs ──────────────────────────────────────────────────────────────────────
export interface RdoResumo {
  id: string;
  data: string | null;
  responsavel: string | null;
  central: string | null;
  frente_trabalho: string | null;
  status: string | null;
  dispositivos_instalados: Record<string, number> | null;
  fotos_dia: string[] | null;
}

function totalDisp(di: Record<string, number> | null): number {
  return di ? Object.values(di).reduce((s, n) => s + (Number(n) || 0), 0) : 0;
}

export function rdosParaCsv(rows: RdoResumo[]): string {
  const cols = ["Data", "Responsável", "Central", "Frente", "Status", "Dispositivos instalados", "Fotos"];
  const linhas = [cols.join(";")];
  for (const r of rows) {
    linhas.push([
      dataBR(r.data),
      r.responsavel ?? "",
      r.central ?? "",
      r.frente_trabalho ?? "",
      r.status ?? "",
      totalDisp(r.dispositivos_instalados),
      (r.fotos_dia ?? []).length,
    ].map(csvCell).join(";"));
  }
  return "﻿" + linhas.join("\n");
}

export async function rdosParaPdf(rows: RdoResumo[], subtitulo: string): Promise<Buffer> {
  const corpo = rows.length
    ? rows.map((r) => `
        <tr>
          <td>${dataBR(r.data) || "—"}</td>
          <td>${esc(r.responsavel ?? "—")}</td>
          <td>${esc(r.central ?? "—")}</td>
          <td>${esc(r.frente_trabalho ?? "—")}</td>
          <td><span class="st st-${esc(r.status ?? "")}">${esc(r.status ?? "—")}</span></td>
          <td>${totalDisp(r.dispositivos_instalados)}</td>
          <td>${(r.fotos_dia ?? []).length}</td>
        </tr>`).join("")
    : `<tr><td colspan="7" class="vazio">Nenhum RDO encontrado para os filtros informados.</td></tr>`;

  const html = relatorioHtml(
    "Relatório de RDOs",
    subtitulo,
    `<thead><tr>
       <th>Data</th><th>Responsável</th><th>Central</th><th>Frente</th>
       <th>Status</th><th>Disp. instalados</th><th>Fotos</th>
     </tr></thead><tbody>${corpo}</tbody>`,
    rows.length
  );
  return renderPdfFromHtml(html);
}

// Shared simple-table report shell (matches the design language: MANSUR red).
function relatorioHtml(titulo: string, subtitulo: string, tabelaInner: string, total: number): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Noto Sans', sans-serif; font-size: 9pt; color: #111; }
    .cab { border-bottom: 3px solid #b91c1c; padding-bottom: 8px; margin-bottom: 10px; }
    .cab h1 { font-size: 15pt; color: #b91c1c; }
    .cab .sub { font-size: 9.5pt; color: #374151; margin-top: 2px; }
    .cab .tot { font-size: 9pt; color: #6b7280; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; padding: 3px 6px; text-align: left; vertical-align: top; }
    th { background: #b91c1c; color: #fff; font-size: 8pt; }
    tr:nth-child(even) td { background: #fafafa; }
    .vazio { text-align: center; color: #6b7280; font-style: italic; padding: 16px; }
    .st { padding: 1px 6px; border-radius: 8px; font-size: 7.5pt; font-weight: bold; color: #fff; }
    .st-pendente { background: #6b7280; } .st-instalado { background: #2563eb; }
    .st-enderecado { background: #7c3aed; } .st-testado { background: #16a34a; }
    .st-concluido { background: #16a34a; } .st-em_andamento { background: #d97706; }
    .st-cancelado { background: #6b7280; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body>
    <div class="cab">
      <h1>${esc(titulo)}</h1>
      <div class="sub">${esc(subtitulo)}</div>
      <div class="tot">${total} registro(s) • gerado pelo Sistema de Gestão Mansur</div>
    </div>
    <table>${tabelaInner}</table>
  </body></html>`;
}
