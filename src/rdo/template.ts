// RDO (Relatório Diário de Obra) → HTML for the Playwright PDF engine.
//
// Renders one assembled `rdos` row into the approved RDO model: the MANSUR
// header + the 8 sections captured by the WhatsApp flow (perguntas.ts), the
// day's progress photos embedded inline (as small base64 data-URIs prepared by
// the caller), and a "Registro fotográfico dos dispositivos instalados hoje"
// reference section linking to the dashboard galleries.
//
// PURE: no DB, no network, no sharp. The caller (gerarPdf.ts) loads the row and
// turns photo URLs into thumbnails; this only builds the markup. That keeps it
// trivially unit-testable.

import fs from "fs";
import path from "path";
import { TIPO_LABEL } from "../alarme/expectedBom";

// One device installed today, with its dashboard gallery link (P2-3).
export interface DispositivoInstaladoLink {
  setor: string | null;
  endereco: string | null;
  laco: number | null;
  tipo_dispositivo: string;
  qtd_fotos: number;
  link_galeria: string;       // dashboard path, e.g. /alarme/fotos?...
}

export interface DadosRdoPdf {
  numeroRdo?: string | null;          // sequential/display id, if any
  data: string | null;               // ISO yyyy-mm-dd
  responsavel: string | null;
  periodo: string | null;            // "diurno" | "noturno"
  clima: string | null;
  central: string | null;
  laco: string | null;
  frente_trabalho: string | null;
  efetivo: Record<string, number> | null;
  atividades: Record<string, string | null> | null;
  dispositivos_instalados: Record<string, number> | null;
  pt_numero: string | null;
  integracao_novos: boolean | null;
  ocorrencias: string | null;
  atrasos: { descricao?: string | null } | null;
  planejamento_proximo_dia: string | null;
  status: string | null;
  // The day's progress photos as inline data-URIs (already downscaled).
  fotosDataUris: string[];
  // Devices installed on this RDO's date, with gallery links (may be empty).
  dispositivosInstalados: DispositivoInstaladoLink[];
  // Absolute base for the dashboard links shown in the reference section.
  dashboardBaseUrl?: string | null;
}

const EFETIVO_LABEL: Record<string, string> = {
  eletricistas: "Eletricistas",
  ajudantes: "Ajudantes",
  tecnicos: "Técnicos",
  supervisores: "Supervisores / Encarregados",
};

const ATIVIDADE_LABEL: Record<string, string> = {
  infraestrutura: "Infraestrutura (eletrocalha, eletroduto)",
  cabeamento: "Cabeamento",
  montagem: "Montagem / instalação de dispositivos",
  programacao: "Programação / endereçamento / testes",
};

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

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function periodoLabel(p: string | null): string {
  if (p === "diurno") return "Diurno";
  if (p === "noturno") return "Noturno";
  return p ? escHtml(p) : "—";
}

// "—" when blank, so an incomplete field reads as pending rather than empty.
function ouTraco(s: string | null | undefined): string {
  const v = (s ?? "").toString().trim();
  return v ? escHtml(v) : "—";
}

// A labelled value row inside a section.
function linha(label: string, valor: string): string {
  return `<tr><td class="lbl">${escHtml(label)}</td><td class="val">${valor}</td></tr>`;
}

function secaoTitulo(n: number, titulo: string): string {
  return `<div class="sec-titulo"><span class="sec-num">${n}</span>${escHtml(titulo)}</div>`;
}

export function renderRdoHtml(d: DadosRdoPdf): string {
  const logoMansurSrc = logoBase64("logo-mansur.png") || logoBase64("logo-mansur.svg");
  const logoBarrySrc  = logoBase64("logo-barry.png")  || logoBase64("logo-barry.svg");

  // ── 3. Efetivo ──
  const efetivo = d.efetivo ?? {};
  const totalEfetivo = Object.values(efetivo).reduce((s, n) => s + (Number(n) || 0), 0);
  const efetivoRows = Object.keys(EFETIVO_LABEL)
    .map((k) => linha(EFETIVO_LABEL[k], String(efetivo[k] ?? 0)))
    .join("");

  // ── 4. Atividades ──
  const atividades = d.atividades ?? {};
  const atividadeRows = Object.keys(ATIVIDADE_LABEL)
    .map((k) => linha(ATIVIDADE_LABEL[k], ouTraco(atividades[k])))
    .join("");

  // ── 5. Dispositivos instalados hoje ──
  const di = d.dispositivos_instalados ?? {};
  const totalDisp = Object.values(di).reduce((s, n) => s + (Number(n) || 0), 0);
  const dispRows = Object.keys(TIPO_LABEL)
    .filter((k) => k !== "outro")
    .map((k) => linha(TIPO_LABEL[k], String(di[k] ?? 0)))
    .join("");

  // ── 8. Photos ──
  const fotosHtml = d.fotosDataUris.length > 0
    ? `<div class="fotos-grid">${d.fotosDataUris
        .map((src, i) => `<div class="foto-wrap"><img class="foto" src="${src}" alt="Foto ${i + 1}"/></div>`)
        .join("")}</div>`
    : `<div class="vazio">Nenhuma foto de andamento foi registrada neste dia.</div>`;

  // ── Reference: device photo record links ──
  const base = (d.dashboardBaseUrl ?? "").replace(/\/$/, "");
  const linkAbs = (p: string) => (base ? `${base}${p.startsWith("/") ? "" : "/"}${p}` : p);
  const galeriaDiaPath = `/alarme/fotos?data=${encodeURIComponent(d.data ?? "")}`;

  const registroFotograficoHtml = (() => {
    if (d.dispositivosInstalados.length === 0) {
      return `<div class="vazio">Nenhum dispositivo foi marcado como instalado nesta data ainda.
        Quando os dispositivos forem fotografados pelo WhatsApp, eles aparecerão aqui com link para a galeria.</div>`;
    }
    const itens = d.dispositivosInstalados
      .map((g) => {
        const loc = [g.setor, g.endereco ?? (g.laco != null ? `Laço ${g.laco}` : null)]
          .filter(Boolean)
          .join(" · ");
        const tipo = TIPO_LABEL[g.tipo_dispositivo] ?? g.tipo_dispositivo;
        const href = linkAbs(g.link_galeria);
        return `<li><span class="rf-tipo">${escHtml(tipo)}</span>
          <span class="rf-loc">${escHtml(loc || "—")}</span>
          <span class="rf-fotos">${g.qtd_fotos} foto(s)</span>
          <a class="rf-link" href="${escHtml(href)}">abrir galeria</a></li>`;
      })
      .join("");
    return `
      <p class="rf-intro">Acesse o registro fotográfico completo dos dispositivos instalados hoje na
        <a href="${escHtml(linkAbs(galeriaDiaPath))}">galeria do dia</a>.</p>
      <ul class="rf-lista">${itens}</ul>`;
  })();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Noto Sans', sans-serif; font-size: 10pt; color: #111; background: #fff; }

  .header {
    display: flex; align-items: center; justify-content: space-between;
    border: 2px solid #000; padding: 6px 10px;
  }
  .header img { height: 48px; width: auto; }
  .header-title {
    flex: 1; text-align: center; font-size: 14pt; font-weight: bold;
    line-height: 1.2; padding: 0 10px; letter-spacing: 0.5px;
  }

  .meta-bar {
    display: flex; border: 2px solid #000; border-top: none;
    font-size: 10pt; font-weight: bold; margin-bottom: 8px;
  }
  .meta-bar > div { flex: 1; padding: 4px 8px; border-right: 1px solid #000; text-align: center; }
  .meta-bar > div:last-child { border-right: none; }
  .meta-bar .meta-val { font-weight: normal; display: block; margin-top: 2px; }

  .status-chip {
    display: inline-block; padding: 1px 8px; border-radius: 10px;
    font-size: 8pt; font-weight: bold; color: #fff;
  }
  .status-concluido { background: #16a34a; }
  .status-em_andamento { background: #d97706; }
  .status-cancelado { background: #6b7280; }

  .sec { border: 1px solid #000; margin-bottom: 7px; page-break-inside: avoid; }
  .sec-titulo {
    background: #b91c1c; color: #fff; font-weight: bold; font-size: 10.5pt;
    padding: 4px 8px; display: flex; align-items: center; gap: 8px;
  }
  .sec-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; border-radius: 50%; background: #fff; color: #b91c1c;
    font-size: 9pt; font-weight: bold;
  }
  .sec-body { padding: 6px 10px; }

  table.kv { width: 100%; border-collapse: collapse; }
  table.kv td { padding: 3px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  table.kv tr:last-child td { border-bottom: none; }
  table.kv td.lbl { width: 45%; color: #374151; font-weight: 600; }
  table.kv td.val { width: 55%; }

  .total-row { font-weight: bold; background: #fef2f2; }

  .vazio { color: #6b7280; font-style: italic; padding: 8px 2px; font-size: 9.5pt; }

  /* Photos */
  .fotos-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .foto-wrap {
    width: calc(33.333% - 4px); height: 150px; border: 1px solid #d1d5db;
    overflow: hidden; background: #f3f4f6;
  }
  .foto { width: 100%; height: 100%; object-fit: cover; }

  /* Device photo-record reference */
  .rf-intro { font-size: 9.5pt; margin-bottom: 6px; }
  .rf-lista { list-style: none; }
  .rf-lista li {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 4px 0; border-bottom: 1px solid #eee; font-size: 9pt;
  }
  .rf-tipo { font-weight: bold; min-width: 150px; }
  .rf-loc { flex: 1; color: #374151; }
  .rf-fotos { color: #6b7280; }
  .rf-link, .rf-intro a { color: #b91c1c; text-decoration: underline; }

  .assinaturas { display: flex; gap: 24px; margin-top: 14px; page-break-inside: avoid; }
  .assinatura { flex: 1; text-align: center; padding-top: 26px; border-top: 1px solid #000; font-size: 9pt; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="header">
  ${logoMansurSrc ? `<img src="${logoMansurSrc}" alt="Mansur"/>` : `<div style="width:110px;font-weight:bold;font-size:14pt">MANSUR</div>`}
  <div class="header-title">RELATÓRIO DIÁRIO DE OBRA (RDO)<br/>SISTEMA DE ALARME DE INCÊNDIO</div>
  ${logoBarrySrc ? `<img src="${logoBarrySrc}" alt="Barry Callebaut"/>` : `<div style="width:130px;font-weight:bold;font-size:10pt;text-align:right">BARRY CALLEBAUT</div>`}
</div>

<div class="meta-bar">
  <div>DATA<span class="meta-val">${dataBR(d.data)}</span></div>
  <div>RDO Nº<span class="meta-val">${ouTraco(d.numeroRdo)}</span></div>
  <div>RESPONSÁVEL<span class="meta-val">${ouTraco(d.responsavel)}</span></div>
  <div>STATUS<span class="meta-val"><span class="status-chip status-${escHtml(d.status ?? "em_andamento")}">${escHtml((d.status ?? "—").toUpperCase())}</span></span></div>
</div>

<!-- 1. Identificação -->
<div class="sec">
  ${secaoTitulo(1, "Identificação")}
  <div class="sec-body"><table class="kv">
    ${linha("Data do relatório", dataBR(d.data))}
    ${linha("Responsável", ouTraco(d.responsavel))}
    ${linha("Período", periodoLabel(d.periodo))}
    ${linha("Clima", ouTraco(d.clima))}
  </table></div>
</div>

<!-- 2. Localização / frente de trabalho -->
<div class="sec">
  ${secaoTitulo(2, "Localização / Frente de trabalho")}
  <div class="sec-body"><table class="kv">
    ${linha("Central", ouTraco(d.central))}
    ${linha("Laço", ouTraco(d.laco))}
    ${linha("Frente de trabalho / área", ouTraco(d.frente_trabalho))}
  </table></div>
</div>

<!-- 3. Efetivo em campo -->
<div class="sec">
  ${secaoTitulo(3, "Efetivo em campo")}
  <div class="sec-body"><table class="kv">
    ${efetivoRows}
    <tr class="total-row"><td class="lbl">Total em campo</td><td class="val">${totalEfetivo}</td></tr>
  </table></div>
</div>

<!-- 4. Atividades executadas -->
<div class="sec">
  ${secaoTitulo(4, "Atividades executadas")}
  <div class="sec-body"><table class="kv">${atividadeRows}</table></div>
</div>

<!-- 5. Dispositivos instalados hoje -->
<div class="sec">
  ${secaoTitulo(5, "Dispositivos instalados hoje")}
  <div class="sec-body"><table class="kv">
    ${dispRows}
    <tr class="total-row"><td class="lbl">Total instalado hoje</td><td class="val">${totalDisp}</td></tr>
  </table></div>
</div>

<!-- 6. Segurança / integração -->
<div class="sec">
  ${secaoTitulo(6, "Segurança / Integração")}
  <div class="sec-body"><table class="kv">
    ${linha("Permissão de Trabalho (PT)", ouTraco(d.pt_numero))}
    ${linha("Integração de novos colaboradores", d.integracao_novos == null ? "—" : (d.integracao_novos ? "Sim" : "Não"))}
  </table></div>
</div>

<!-- 7. Ocorrências, atrasos e planejamento -->
<div class="sec">
  ${secaoTitulo(7, "Ocorrências, atrasos e planejamento")}
  <div class="sec-body"><table class="kv">
    ${linha("Ocorrências / intercorrências", ouTraco(d.ocorrencias))}
    ${linha("Atrasos / impedimentos", ouTraco(d.atrasos?.descricao ?? null))}
    ${linha("Planejamento do próximo dia", ouTraco(d.planejamento_proximo_dia))}
  </table></div>
</div>

<!-- 8. Registro fotográfico do dia -->
<div class="sec">
  ${secaoTitulo(8, "Registro fotográfico do dia")}
  <div class="sec-body">${fotosHtml}</div>
</div>

<!-- Reference: device photo record -->
<div class="sec">
  ${secaoTitulo(9, "Registro fotográfico dos dispositivos instalados hoje")}
  <div class="sec-body">${registroFotograficoHtml}</div>
</div>

<div class="assinaturas">
  <div class="assinatura">Responsável Mansur</div>
  <div class="assinatura">Fiscalização Barry Callebaut</div>
</div>

</body>
</html>`;
}
