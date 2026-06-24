import fs from "fs";
import path from "path";

// Hydrant ficha — mirrors the extinguisher template but with the hydrant
// checklist (10 items) and 4 status columns: OK / RUIM / PENDENTE / ENCAMINHAR
// MANUTENÇÃO, plus OBSERVAÇÕES — matching "FICHA DE INSPEÇÃO MENSAL DOS HIDRANTES".

export type StatusHidranteCell = "OK" | "RUIM" | "PENDENTE" | "ENCAMINHAR" | "N.A" | "Indeterminado" | "";

export interface ItemHidranteFicha {
  nome: string;
  status: StatusHidranteCell;
  observacao: string;
}

export interface HidranteFicha {
  numero: string;
  setor: string;
  itens: ItemHidranteFicha[];
  fotos: string[];
  naoInspecionado?: boolean;
}

export interface DadosFichaHidrante {
  unidade: string;
  mesReferencia: string;
  dataInspecao: string;
  hidrantes: HidranteFicha[];
  participantes?: string[];
}

const PARTICIPANTES_PADRAO = ["RODRIGO LIMA DOS SANTOS"];
const CHECKMARK = "&#10003;";

function logoBase64(filename: string): string {
  const filePath = path.join(process.cwd(), "assets", filename);
  if (!fs.existsSync(filePath)) return "";
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function escHtml(s: string | null | undefined): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Marks the matching column when status equals it. N.A surfaces in OBSERVAÇÕES.
function cellStatus(status: string, target: StatusHidranteCell): string {
  return status === target ? CHECKMARK : "";
}
function observacaoCell(item: ItemHidranteFicha): string {
  if (item.observacao) return escHtml(item.observacao);
  if (item.status === "N.A") return "N.A";
  if (item.status === "Indeterminado") return "—";
  return "";
}

function renderHidrante(h: HidranteFicha, index: number): string {
  const isFirstOnPage = index % 3 === 0;
  const pageBreak = isFirstOnPage && index > 0 ? 'style="page-break-before: always;"' : "";

  const fotosHtml = h.fotos.length > 0
    ? h.fotos.slice(0, 4).map((url) => `<img src="${escHtml(url)}" class="foto" onerror="this.style.visibility='hidden'" />`).join("")
    : (h.naoInspecionado ? `<div class="sem-foto">Não inspecionado neste mês</div>` : `<div class="sem-foto">Sem fotos</div>`);

  const itensHtml = h.itens.map((item) => `
    <tr>
      <td class="col-item">${escHtml(item.nome)}</td>
      <td class="col-check">${cellStatus(item.status, "OK")}</td>
      <td class="col-check">${cellStatus(item.status, "RUIM")}</td>
      <td class="col-check">${cellStatus(item.status, "PENDENTE")}</td>
      <td class="col-check">${cellStatus(item.status, "ENCAMINHAR")}</td>
      <td class="col-obs">${observacaoCell(item)}</td>
    </tr>`).join("");

  const blocoClasse = h.naoInspecionado ? "hidrante-bloco nao-inspecionado" : "hidrante-bloco";

  return `
  <div class="${blocoClasse}" ${pageBreak}>
    <div class="hidrante-header">
      <span class="hidrante-num">Hidrante ${escHtml(h.numero)}</span>
      <span class="hidrante-setor">SETOR: ${escHtml(h.setor)}</span>
    </div>
    <div class="hidrante-body">
      <table class="checklist">
        <thead>
          <tr>
            <th class="col-item">DESCRIÇÃO</th>
            <th class="col-check th-rot"><div class="rot-wrap"><span>OK</span></div></th>
            <th class="col-check th-rot"><div class="rot-wrap"><span>RUIM</span></div></th>
            <th class="col-check th-rot"><div class="rot-wrap"><span>PENDENTE</span></div></th>
            <th class="col-check th-rot"><div class="rot-wrap"><span>ENCAMINHAR MANUTENÇÃO</span></div></th>
            <th class="col-obs">OBSERVAÇÕES</th>
          </tr>
        </thead>
        <tbody>${itensHtml}</tbody>
      </table>
      <div class="fotos-col">${fotosHtml}</div>
    </div>
  </div>`;
}

export function renderHtmlHidrante(dados: DadosFichaHidrante): string {
  const nomes = dados.participantes && dados.participantes.length > 0 ? dados.participantes : PARTICIPANTES_PADRAO;
  const logoMansurSrc = logoBase64("logo-mansur.png") || logoBase64("logo-mansur.svg");
  const logoBarrySrc  = logoBase64("logo-barry.png")  || logoBase64("logo-barry.svg");
  const blocos = dados.hidrantes.map((h, i) => renderHidrante(h, i)).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Noto Sans', sans-serif; font-size: 9pt; color: #000; background: #fff; }
  .header { display: flex; align-items: center; justify-content: space-between; border: 2px solid #000; padding: 6px 10px; }
  .header img { height: 50px; width: auto; }
  .header-title { flex: 1; text-align: center; font-size: 15pt; font-weight: bold; line-height: 1.2; padding: 0 10px; letter-spacing: 0.5px; }
  .unidade-bar { text-align: center; font-size: 13pt; font-weight: bold; border: 2px solid #000; border-top: none; padding: 4px; margin-bottom: 6px; letter-spacing: 1px; }
  .hidrante-bloco { border: 2px solid #000; margin-bottom: 5px; page-break-inside: avoid; }
  .hidrante-bloco.nao-inspecionado { opacity: 0.85; }
  .hidrante-header { display: flex; padding: 0; font-weight: bold; font-size: 10pt; border-bottom: 2px solid #000; }
  .hidrante-num { width: 30%; text-align: center; padding: 3px 8px; border-right: 2px solid #000; }
  .hidrante-setor { flex: 1; text-align: center; padding: 3px 8px; }
  .hidrante-body { display: flex; gap: 0; }
  .checklist { width: 360px; min-width: 360px; border-collapse: collapse; }
  .checklist th, .checklist td { border: 1px solid #000; padding: 1px 4px; vertical-align: middle; height: 16px; }
  .checklist th { background: #fff; font-size: 7pt; text-align: center; font-weight: bold; }
  .checklist thead th { vertical-align: bottom; }
  .col-item  { width: 130px; text-align: left; font-size: 8pt; }
  .col-check { width: 22px; text-align: center; font-size: 11pt; }
  .col-obs   { width: 120px; text-align: center; font-size: 7.5pt; }
  /* Rotated column headers. Height must clear the LONGEST label
     ("ENCAMINHAR MANUTENÇÃO" ≈ 115px tall at 6pt) so the vertical text fits on a
     single line inside the cell. overflow:hidden is only a safety net — the
     height is sized so nothing is actually clipped. */
  .th-rot { height: 120px; padding: 0; overflow: hidden; }
  .th-rot .rot-wrap { height: 120px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .th-rot .rot-wrap span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; font-size: 6pt; font-weight: bold; line-height: 1; }
  .fotos-col { flex: 1; border-left: 2px solid #000; display: flex; flex-wrap: nowrap; align-items: stretch; gap: 0; }
  .fotos-col img.foto { flex: 1; width: 25%; min-width: 0; height: auto; max-height: 175px; object-fit: cover; border-right: 1px solid #999; }
  .fotos-col img.foto:last-child { border-right: none; }
  .sem-foto { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 8pt; color: #999; padding: 20px; font-style: italic; }
  .footer { border: 2px solid #000; margin-top: 8px; display: flex; page-break-inside: avoid; font-size: 8.5pt; }
  .footer-obs { flex: 1.4; border-right: 2px solid #000; }
  .footer-obs-title { text-align: center; font-weight: bold; padding: 3px; border-bottom: 1px solid #000; }
  .footer-obs-area { min-height: 90px; }
  .footer-data { flex: 1; border-right: 2px solid #000; padding: 6px; text-align: center; font-weight: bold; }
  .footer-data .linha { margin-top: 14px; font-weight: normal; }
  .footer-part { flex: 1.2; }
  .footer-part-title { text-align: center; font-weight: bold; padding: 3px; border-bottom: 1px solid #000; }
  .participante { padding: 6px 8px; border-bottom: 1px solid #000; display: flex; gap: 8px; }
  .participante:last-child { border-bottom: none; }
  .participante-nome { flex: 1; font-size: 8pt; }
  .participante-ass { font-weight: bold; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="header">
  ${logoMansurSrc ? `<img src="${logoMansurSrc}" alt="Mansur"/>` : `<div style="width:110px;font-weight:bold;font-size:14pt">MANSUR</div>`}
  <div class="header-title">FICHA DE INSPEÇÃO MENSAL DOS HIDRANTES</div>
  ${logoBarrySrc ? `<img src="${logoBarrySrc}" alt="Barry Callebaut"/>` : `<div style="width:130px;font-weight:bold;font-size:10pt;text-align:right">BARRY CALLEBAUT</div>`}
</div>

<div class="unidade-bar">${escHtml(dados.unidade.toUpperCase())}${dados.mesReferencia ? " - " + escHtml(dados.mesReferencia.toUpperCase()) : ""}</div>

${blocos}

<div class="footer">
  <div class="footer-obs">
    <div class="footer-obs-title">OBSERVAÇÕES GERAIS</div>
    <div class="footer-obs-area"></div>
  </div>
  <div class="footer-data">DATA INSPEÇÃO<div class="linha">___ / ___ / ______</div></div>
  <div class="footer-part">
    <div class="footer-part-title">PARTICIPANTES</div>
    ${nomes.map((n) => `
    <div class="participante">
      <span class="participante-nome">Nome.: ${escHtml(n)}</span>
      <span class="participante-ass">Ass:</span>
    </div>`).join("")}
  </div>
</div>

</body>
</html>`;
}
