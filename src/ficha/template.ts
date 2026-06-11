import fs from "fs";
import path from "path";

export interface ItemInspecao {
  nome: string;
  status: "OK" | "Reprovado" | "N.A" | "Indeterminado" | "";
  observacao: string;
}

export interface ExtintorFicha {
  numero: string;
  setor: string;
  tipo_carga: string;
  itens: ItemInspecao[];
  fotos: string[];
  // true when there is no inspection for this extinguisher in the reference month
  naoInspecionado?: boolean;
}

export interface DadosFicha {
  unidade: string;
  mesReferencia: string;
  dataInspecao: string;
  extintores: ExtintorFicha[];
  // Active inspectors to show in the PARTICIPANTES footer.
  // Falls back to PARTICIPANTES_PADRAO when not provided or empty.
  participantes?: string[];
}

// Hardcoded fallback used when the inspetores table has no active records.
const PARTICIPANTES_PADRAO = [
  "RODRIGO LIMA SANTOS",
  "JOÃO VICTOR A. DOS SANTOS",
  "GABRIEL REIS P. DOS SANTOS",
];

const CHECKMARK = "&#10003;"; // ✓

function logoBase64(filename: string): string {
  const filePath = path.join(process.cwd(), "assets", filename);
  if (!fs.existsSync(filePath)) return "";
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
  const data = fs.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${data}`;
}

function escHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Checkmark goes in the OK column for "OK", in the REPROVADO column for "Reprovado".
// "N.A" and "Indeterminado" leave both boxes empty (the value surfaces in OBSERVAÇÕES).
function cellStatus(status: string, target: "OK" | "REPROVADO"): string {
  if (target === "OK" && status === "OK") return CHECKMARK;
  if (target === "REPROVADO" && status === "Reprovado") return CHECKMARK;
  return "";
}

// The OBSERVAÇÕES column shows free text when present; otherwise "N.A" for
// not-applicable items (matches how the real sheet annotates CO2 manometers,
// external floor signage, etc.).
function observacaoCell(item: ItemInspecao): string {
  if (item.observacao) return escHtml(item.observacao);
  if (item.status === "N.A") return "N.A";
  return "";
}

function renderExtintor(ext: ExtintorFicha, index: number): string {
  const isFirstOnPage = index % 3 === 0;
  const pageBreak = isFirstOnPage && index > 0 ? 'style="page-break-before: always;"' : "";

  const fotosHtml = ext.fotos.length > 0
    ? ext.fotos.slice(0, 4).map((url) =>
        `<img src="${escHtml(url)}" class="foto" onerror="this.style.visibility='hidden'" />`
      ).join("")
    : (ext.naoInspecionado
        ? `<div class="sem-foto">Não inspecionado neste mês</div>`
        : `<div class="sem-foto">Sem fotos</div>`);

  const itensHtml = ext.itens.map((item) => `
    <tr>
      <td class="col-item">${escHtml(item.nome)}</td>
      <td class="col-check">${cellStatus(item.status, "OK")}</td>
      <td class="col-check">${cellStatus(item.status, "REPROVADO")}</td>
      <td class="col-obs">${observacaoCell(item)}</td>
    </tr>`).join("");

  // Charge type sits as a single centered row spanning the checklist width,
  // exactly like the real sheet (e.g. "ABC 06 KG", "CO2 06 KG", "AP 10LT").
  const tipoCargaRow = `
    <tr>
      <td class="tipo-carga-cell" colspan="4">${escHtml(ext.tipo_carga || "")}</td>
    </tr>`;

  const blocoClasse = ext.naoInspecionado ? "extintor-bloco nao-inspecionado" : "extintor-bloco";

  return `
  <div class="${blocoClasse}" ${pageBreak}>
    <div class="extintor-header">
      <span class="extintor-num">Nº ${escHtml(ext.numero)}</span>
      <span class="extintor-setor">SETOR: ${escHtml(ext.setor)}</span>
    </div>
    <div class="extintor-body">
      <table class="checklist">
        <thead>
          <tr>
            <th class="col-item">DESCRIÇÃO</th>
            <th class="col-check th-rot"><div class="rot-wrap"><span>OK</span></div></th>
            <th class="col-check th-rot"><div class="rot-wrap"><span>REPROVADO</span></div></th>
            <th class="col-obs">OBSERVAÇÕES</th>
          </tr>
        </thead>
        <tbody>
          ${itensHtml}
          ${tipoCargaRow}
        </tbody>
      </table>
      <div class="fotos-col">${fotosHtml}</div>
    </div>
  </div>`;
}

export function renderHtml(dados: DadosFicha): string {
  const nomes = dados.participantes && dados.participantes.length > 0
    ? dados.participantes
    : PARTICIPANTES_PADRAO;
  const logoMansurSrc = logoBase64("logo-mansur.png") || logoBase64("logo-mansur.svg");
  const logoBarrySrc  = logoBase64("logo-barry.png")  || logoBase64("logo-barry.svg");

  const blocos = dados.extintores.map((ext, i) => renderExtintor(ext, i)).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Noto Sans', sans-serif; font-size: 9pt; color: #000; background: #fff; }

  /* ── Header (repeats visually on every printed page via running header is not
        trivial in print; instead we let it appear once at the top) ── */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    border: 2px solid #000; padding: 6px 10px;
  }
  .header img { height: 50px; width: auto; }
  .header-title {
    flex: 1; text-align: center; font-size: 15pt; font-weight: bold;
    line-height: 1.2; padding: 0 10px; letter-spacing: 0.5px;
  }

  /* ── Site/month bar ── */
  .unidade-bar {
    text-align: center; font-size: 13pt; font-weight: bold;
    border: 2px solid #000; border-top: none; padding: 4px;
    margin-bottom: 6px; letter-spacing: 1px;
  }

  /* ── Extinguisher block ── */
  .extintor-bloco {
    border: 2px solid #000; margin-bottom: 5px; page-break-inside: avoid;
  }
  .extintor-bloco.nao-inspecionado { opacity: 0.85; }
  .extintor-header {
    display: flex; padding: 0; font-weight: bold; font-size: 10pt;
    border-bottom: 2px solid #000;
  }
  .extintor-num {
    width: 30%; text-align: center; padding: 3px 8px;
    border-right: 2px solid #000;
  }
  .extintor-setor { flex: 1; text-align: center; padding: 3px 8px; }

  .extintor-body { display: flex; gap: 0; }

  /* ── Checklist ── */
  .checklist { width: 320px; min-width: 320px; border-collapse: collapse; }
  .checklist th, .checklist td {
    border: 1px solid #000; padding: 1px 4px; vertical-align: middle;
    height: 16px;
  }
  .checklist th { background: #fff; font-size: 7pt; text-align: center; font-weight: bold; }
  .checklist thead th { vertical-align: bottom; }
  .col-item  { width: 130px; text-align: left; font-size: 8pt; }
  .col-check { width: 22px; text-align: center; font-size: 11pt; }
  .col-obs   { width: 130px; text-align: center; font-size: 7.5pt; }

  /* Rotated narrow column headers (OK / REPROVADO) like the real sheet.
     A flex wrapper centers the rotated text inside the fixed-height cell so
     it can't bleed into the row above. */
  .th-rot { height: 54px; padding: 0; }
  .th-rot .rot-wrap {
    height: 54px; display: flex; align-items: center; justify-content: center;
  }
  .th-rot .rot-wrap span {
    writing-mode: vertical-rl; transform: rotate(180deg);
    white-space: nowrap; font-size: 6pt; font-weight: bold; line-height: 1;
  }

  .tipo-carga-cell {
    text-align: center; font-weight: bold; font-size: 8.5pt;
    background: #fff; height: 18px;
  }

  /* ── Photos column ── */
  .fotos-col {
    flex: 1; border-left: 2px solid #000;
    display: flex; flex-wrap: nowrap; align-items: stretch;
    gap: 0;
  }
  .fotos-col img.foto {
    flex: 1; width: 25%; min-width: 0; height: auto; max-height: 175px;
    object-fit: cover; border-right: 1px solid #999;
  }
  .fotos-col img.foto:last-child { border-right: none; }
  .sem-foto {
    flex: 1; display: flex; align-items: center; justify-content: center;
    font-size: 8pt; color: #999; padding: 20px; font-style: italic;
  }

  /* ── Footer ── */
  .footer {
    border: 2px solid #000; margin-top: 8px; display: flex;
    page-break-inside: avoid; font-size: 8.5pt;
  }
  .footer-obs { flex: 1.4; border-right: 2px solid #000; }
  .footer-obs-title { text-align: center; font-weight: bold; padding: 3px; border-bottom: 1px solid #000; }
  .footer-obs-area { min-height: 90px; }
  .footer-data {
    flex: 1; border-right: 2px solid #000; padding: 6px;
    text-align: center; font-weight: bold;
  }
  .footer-data .linha { margin-top: 14px; font-weight: normal; }
  .footer-part { flex: 1.2; }
  .footer-part-title { text-align: center; font-weight: bold; padding: 3px; border-bottom: 1px solid #000; }
  .participante {
    padding: 6px 8px; border-bottom: 1px solid #000; display: flex; gap: 8px;
  }
  .participante:last-child { border-bottom: none; }
  .participante-nome { flex: 1; font-size: 8pt; }
  .participante-ass { font-weight: bold; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<div class="header">
  ${logoMansurSrc ? `<img src="${logoMansurSrc}" alt="Mansur"/>` : `<div style="width:110px;font-weight:bold;font-size:14pt">MANSUR</div>`}
  <div class="header-title">FICHA DE INSPEÇÃO MENSAL DOS EXTINTORES</div>
  ${logoBarrySrc  ? `<img src="${logoBarrySrc}"  alt="Barry Callebaut"/>` : `<div style="width:130px;font-weight:bold;font-size:10pt;text-align:right">BARRY CALLEBAUT</div>`}
</div>

<div class="unidade-bar">FÁBRICA ${escHtml(dados.unidade.toUpperCase())} - ${escHtml(dados.mesReferencia.toUpperCase())}</div>

${blocos}

<div class="footer">
  <div class="footer-obs">
    <div class="footer-obs-title">OBSERVAÇÕES GERAIS</div>
    <div class="footer-obs-area"></div>
  </div>
  <div class="footer-data">
    DATA INSPEÇÃO
    <div class="linha">___ / ___ / ______</div>
  </div>
  <div class="footer-part">
    <div class="footer-part-title">PARTICIPANTES</div>
    ${nomes.map((nome) => `
    <div class="participante">
      <span class="participante-nome">Nome.: ${escHtml(nome)}</span>
      <span class="participante-ass">Ass:</span>
    </div>`).join("")}
  </div>
</div>

</body>
</html>`;
}
