import fs from "fs";
import path from "path";

export interface ItemInspecao {
  nome: string;
  status: "OK" | "Reprovado" | "N.A" | "Indeterminado";
  observacao: string;
}

export interface ExtintorFicha {
  numero: string;
  setor: string;
  tipo_carga: string;
  itens: ItemInspecao[];
  fotos: string[];
}

export interface DadosFicha {
  unidade: string;
  mesReferencia: string;
  dataInspecao: string;
  extintores: ExtintorFicha[];
}

const CHECKMARK = "&#10003;"; // ✓

function logoBase64(filename: string): string {
  const filePath = path.join(process.cwd(), "assets", filename);
  if (!fs.existsSync(filePath)) return "";
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
  const data = fs.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${data}`;
}

function cellStatus(status: string, target: "OK" | "REPROVADO"): string {
  if (target === "OK" && status === "OK") return CHECKMARK;
  if (target === "REPROVADO" && status === "Reprovado") return CHECKMARK;
  return "";
}

function observacaoCell(item: ItemInspecao): string {
  if (item.status === "N.A") return "N.A";
  if (item.status === "Indeterminado") return "?";
  return item.observacao ?? "";
}

function renderExtintor(ext: ExtintorFicha, index: number): string {
  const isFirstOnPage = index % 3 === 0;
  const pageBreak = isFirstOnPage && index > 0 ? 'style="page-break-before: always;"' : "";

  const fotosHtml = ext.fotos.length > 0
    ? ext.fotos.slice(0, 4).map((url) =>
        `<img src="${url}" class="foto" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI2MCIgdmlld0JveD0iMCAwIDgwIDYwIj48cmVjdCB3aWR0aD0iODAiIGhlaWdodD0iNjAiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSI0MCIgeT0iMzUiIGZvbnQtc2l6ZT0iMTAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTkiPkZvdG88L3RleHQ+PC9zdmc+'" />`
      ).join("")
    : `<div class="sem-foto">Sem fotos</div>`;

  const itensHtml = ext.itens.map((item) => `
    <tr>
      <td class="col-item">${item.nome}</td>
      <td class="col-check">${cellStatus(item.status, "OK")}</td>
      <td class="col-check">${cellStatus(item.status, "REPROVADO")}</td>
      <td class="col-obs">${observacaoCell(item)}</td>
    </tr>`).join("");

  return `
  <div class="extintor-bloco" ${pageBreak}>
    <div class="extintor-header">
      <span class="extintor-num">Nº ${ext.numero}</span>
      <span class="extintor-setor">SETOR: ${ext.setor}</span>
    </div>
    <div class="extintor-body">
      <table class="checklist">
        <thead>
          <tr>
            <th class="col-item">ITEM</th>
            <th class="col-check">OK</th>
            <th class="col-check">REPROVADO</th>
            <th class="col-obs">OBSERVAÇÕES</th>
          </tr>
        </thead>
        <tbody>${itensHtml}</tbody>
      </table>
      <div class="fotos-col">${fotosHtml}</div>
    </div>
    <div class="tipo-carga">Carga: <strong>${ext.tipo_carga}</strong></div>
  </div>`;
}

export function renderHtml(dados: DadosFicha): string {
  const logoMansurSrc = logoBase64("logo-mansur.svg") || logoBase64("logo-mansur.png");
  const logoBarrySrc  = logoBase64("logo-barry.svg")  || logoBase64("logo-barry.png");

  // Group extintores into pages of 3 for page-break logic
  const blocos = dados.extintores.map((ext, i) => renderExtintor(ext, i)).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; background: #fff; }

  /* ── Header ── */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    border: 2px solid #000; padding: 6px 10px; margin-bottom: 4px;
  }
  .header img { height: 52px; width: auto; }
  .header-title {
    flex: 1; text-align: center; font-size: 11pt; font-weight: bold;
    line-height: 1.4; padding: 0 10px;
  }

  /* ── Site/month bar ── */
  .unidade-bar {
    text-align: center; font-size: 11pt; font-weight: bold;
    border: 2px solid #000; border-top: none; padding: 5px;
    margin-bottom: 6px; letter-spacing: 1px;
  }

  /* ── Extinguisher block ── */
  .extintor-bloco {
    border: 2px solid #000; margin-bottom: 6px; page-break-inside: avoid;
  }
  .extintor-header {
    background: #d0d0d0; display: flex; gap: 30px;
    padding: 3px 8px; font-weight: bold; font-size: 10pt;
    border-bottom: 1px solid #000;
  }
  .extintor-body { display: flex; gap: 0; }
  .checklist { flex: 1; border-collapse: collapse; }
  .checklist th, .checklist td {
    border: 1px solid #000; padding: 2px 4px; vertical-align: middle;
  }
  .checklist th { background: #e8e8e8; font-size: 8pt; text-align: center; }
  .col-item  { width: 38%; text-align: left; }
  .col-check { width: 11%; text-align: center; font-size: 13pt; }
  .col-obs   { width: 28%; text-align: center; font-size: 8pt; }

  /* ── Photos column ── */
  .fotos-col {
    width: 130px; min-width: 130px; border-left: 1px solid #000;
    display: flex; flex-wrap: wrap; align-content: flex-start;
    gap: 3px; padding: 3px;
  }
  .fotos-col img.foto { width: 60px; height: 50px; object-fit: cover; border: 1px solid #ccc; }
  .sem-foto { font-size: 8pt; color: #999; padding: 6px; }

  .tipo-carga {
    border-top: 1px solid #000; padding: 2px 8px;
    font-size: 8.5pt; background: #f5f5f5;
  }

  /* ── Footer ── */
  .footer {
    border: 2px solid #000; margin-top: 10px; padding: 8px 10px;
    page-break-inside: avoid;
  }
  .footer-title { font-weight: bold; font-size: 10pt; margin-bottom: 6px; }
  .footer-obs-area { min-height: 50px; border: 1px solid #aaa; margin-bottom: 10px; padding: 4px; }
  .footer-data { margin-bottom: 10px; font-size: 9pt; }
  .footer-data span { display: inline-block; border-bottom: 1px solid #000; min-width: 30px; margin: 0 2px; }
  .participantes { display: flex; gap: 20px; flex-wrap: wrap; }
  .participante { flex: 1; min-width: 160px; }
  .participante-nome { font-weight: bold; font-size: 8.5pt; margin-bottom: 2px; }
  .participante-ass { border-top: 1px solid #000; margin-top: 18px; font-size: 8pt; color: #555; padding-top: 2px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<div class="header">
  ${logoMansurSrc ? `<img src="${logoMansurSrc}" alt="Mansur"/>` : `<div style="width:120px;font-weight:bold;font-size:14pt">MANSUR</div>`}
  <div class="header-title">FICHA DE INSPEÇÃO MENSAL<br/>DOS EXTINTORES</div>
  ${logoBarrySrc  ? `<img src="${logoBarrySrc}"  alt="Barry Callebaut"/>` : `<div style="width:120px;font-weight:bold;font-size:9pt;text-align:right">BARRY CALLEBAUT</div>`}
</div>

<div class="unidade-bar">FÁBRICA ${dados.unidade.toUpperCase()} - ${dados.mesReferencia.toUpperCase()}</div>

${blocos}

<div class="footer">
  <div class="footer-title">OBSERVAÇÕES GERAIS</div>
  <div class="footer-obs-area"></div>
  <div class="footer-data">
    DATA INSPEÇÃO: <span>&nbsp;&nbsp;&nbsp;</span>/<span>&nbsp;&nbsp;&nbsp;</span>/<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
  </div>
  <div class="footer-title">PARTICIPANTES</div>
  <div class="participantes">
    ${["RODRIGO LIMA SANTOS", "JOÃO VICTOR A. DOS SANTOS", "GABRIEL REIS P. DOS SANTOS"].map((nome) => `
    <div class="participante">
      <div class="participante-nome">${nome}</div>
      <div class="participante-ass">Ass.:</div>
    </div>`).join("")}
  </div>
</div>

</body>
</html>`;
}
