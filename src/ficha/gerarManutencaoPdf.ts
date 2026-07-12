// Renders a preventive-maintenance visit as an official PDF: MANSUR + Barry
// header, the 7-step checklist (OK / NC / N.A) with observations, non-conformities,
// recommendations, technician photos. Mirrors the hydrant-ficha / cronograma look.

import fs from "fs";
import path from "path";
import { renderPdfFromHtml } from "../pdf/browser";
import { ETAPAS_MANUTENCAO, type StatusEtapa } from "../alarme/manutencao";
import { thumbnailsDeUrls } from "./thumbnails";

export interface VisitaManutencaoPdf {
  central_numero: number | null;
  central_nome: string | null;
  data_visita: string | null;
  tecnicos: string | null;
  responsavel: string | null;
  etapas: Record<string, StatusEtapa>;      // e1_planejamento → "OK" | "NC" | "N.A" | ""
  observacoes_etapas: Record<string, string>;
  nao_conformidades: string | null;
  recomendacoes: string | null;
  observacoes: string | null;
  fotos: string[];
}

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
  if (!iso) return "___/___/______";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
const CHECK = "&#10003;";

// Builds the report HTML (exported for browser-free testing).
export function renderHtmlManutencao(v: VisitaManutencaoPdf): string {
  const logoMansur = logoBase64("logo-mansur.png") || logoBase64("logo-mansur.svg");
  const logoBarry  = logoBase64("logo-barry.png")  || logoBase64("logo-barry.svg");
  const central = v.central_numero != null ? `CENTRAL ${v.central_numero}${v.central_nome ? ` — ${esc(v.central_nome).toUpperCase()}` : ""}` : "CENTRAL —";

  const linhas = ETAPAS_MANUTENCAO.map((et, i) => {
    const val = (v.etapas?.[et.chave] ?? "") as StatusEtapa;
    const obs = v.observacoes_etapas?.[et.chave] ?? "";
    const cel = (alvo: StatusEtapa) => (val === alvo ? CHECK : "");
    return `
      <tr>
        <td class="et-n">${i + 1}</td>
        <td class="et-nome">${esc(et.rotulo)}</td>
        <td class="c ok">${cel("OK")}</td>
        <td class="c nc">${cel("NC")}</td>
        <td class="c na">${cel("N.A")}</td>
        <td class="et-obs">${esc(obs)}</td>
      </tr>`;
  }).join("");

  const fotosHtml = v.fotos.length > 0
    ? `<div class="fotos">${v.fotos.slice(0, 8).map((u) => `<img src="${esc(u)}" onerror="this.style.display='none'"/>`).join("")}</div>`
    : `<div class="sem-foto">Sem fotos anexadas.</div>`;

  const bloco = (titulo: string, texto: string | null) =>
    `<div class="bloco"><div class="bloco-t">${titulo}</div><div class="bloco-c">${texto ? esc(texto) : "—"}</div></div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Noto Sans', sans-serif; font-size: 9pt; color: #111; }
  .header { display: flex; align-items: center; justify-content: space-between; border: 2px solid #000; padding: 6px 10px; }
  .header img { height: 46px; width: auto; }
  .header-title { flex: 1; text-align: center; font-size: 14pt; font-weight: bold; line-height: 1.2; padding: 0 10px; letter-spacing: .5px; }
  .unidade-bar { text-align: center; font-size: 12pt; font-weight: bold; border: 2px solid #000; border-top: none; padding: 4px; letter-spacing: 1px; }
  .meta { display: flex; gap: 0; border: 1px solid #cbd5e1; border-top: none; font-size: 8.5pt; }
  .meta > div { flex: 1; padding: 4px 8px; border-right: 1px solid #cbd5e1; }
  .meta > div:last-child { border-right: none; }
  .meta b { display: block; font-size: 7pt; color: #6b7280; text-transform: uppercase; letter-spacing: .3px; }
  h2.sec { font-size: 9pt; background: #111; color: #fff; padding: 4px 8px; margin: 10px 0 0; letter-spacing: .5px; }
  table.grade { width: 100%; border-collapse: collapse; }
  .grade th, .grade td { border: 1px solid #cbd5e1; padding: 3px 6px; }
  .grade th { background: #f1f5f9; font-size: 7pt; text-align: center; font-weight: bold; }
  .et-n { width: 22px; text-align: center; color: #6b7280; }
  .et-nome { width: 34%; }
  .grade td.c { width: 34px; text-align: center; font-size: 11pt; font-weight: bold; }
  td.c.ok { color: #166534; } td.c.nc { color: #991b1b; }
  .et-obs { font-size: 8pt; color: #374151; }
  .bloco { border: 1px solid #cbd5e1; border-top: none; }
  .bloco-t { background: #f8fafc; font-weight: bold; font-size: 8pt; padding: 3px 8px; border-bottom: 1px solid #e5e7eb; }
  .bloco-c { padding: 6px 8px; min-height: 26px; font-size: 8.5pt; white-space: pre-wrap; }
  .fotos { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px; }
  .fotos img { width: 23%; height: 90px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 3px; }
  .sem-foto { padding: 14px; text-align: center; color: #9ca3af; font-style: italic; font-size: 8pt; }
  .legenda { font-size: 7pt; color: #6b7280; margin-top: 6px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>

<div class="header">
  ${logoMansur ? `<img src="${logoMansur}" alt="Mansur"/>` : `<div style="width:100px;font-weight:bold;font-size:13pt">MANSUR</div>`}
  <div class="header-title">RELATÓRIO DE MANUTENÇÃO PREVENTIVA<br/>SISTEMA DE ALARME DE INCÊNDIO</div>
  ${logoBarry ? `<img src="${logoBarry}" alt="Barry Callebaut"/>` : `<div style="width:120px;font-weight:bold;font-size:9pt;text-align:right">BARRY CALLEBAUT</div>`}
</div>
<div class="unidade-bar">${central}</div>
<div class="meta">
  <div><b>Data da visita</b>${fmtData(v.data_visita)}</div>
  <div><b>Técnicos</b>${esc(v.tecnicos) || "—"}</div>
  <div><b>Responsável</b>${esc(v.responsavel) || "—"}</div>
</div>

<h2 class="sec">ETAPAS DA VISITA PREVENTIVA</h2>
<table class="grade">
  <thead><tr><th>#</th><th class="et-nome">ETAPA</th><th>OK</th><th>NC</th><th>N.A</th><th>OBSERVAÇÕES</th></tr></thead>
  <tbody>${linhas}</tbody>
</table>
<p class="legenda">OK = conforme · NC = não-conformidade · N.A = não se aplica</p>

<h2 class="sec">NÃO-CONFORMIDADES E RECOMENDAÇÕES</h2>
${bloco("Não-conformidades encontradas", v.nao_conformidades)}
${bloco("Recomendações de correção", v.recomendacoes)}
${bloco("Observações gerais", v.observacoes)}

<h2 class="sec">REGISTRO FOTOGRÁFICO</h2>
${fotosHtml}

</body></html>`;
}

export async function gerarManutencaoPdf(
  v: VisitaManutencaoPdf,
  opts: { semFotos?: boolean } = {}
): Promise<Buffer> {
  let dados = v;
  if (!opts.semFotos && v.fotos.length > 0) {
    // Downscale photos to thumbnails so the PDF stays small (same as the fichas).
    const thumbs = await thumbnailsDeUrls(v.fotos);
    dados = { ...v, fotos: v.fotos.map((u) => thumbs.get(u)).filter((x): x is string => !!x) };
  } else if (opts.semFotos) {
    dados = { ...v, fotos: [] };
  }
  return renderPdfFromHtml(renderHtmlManutencao(dados));
}
