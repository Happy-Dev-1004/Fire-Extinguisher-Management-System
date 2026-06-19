// Assembles an RDO row into a branded PDF.
//
// Loads the rdos row, downscales the day's photos to small inline thumbnails
// (reusing the report thumbnail pipeline), resolves the devices installed on the
// RDO's date (with their dashboard gallery links), renders the HTML, and turns
// it into a PDF via the shared Playwright engine.

import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { renderPdfFromHtml } from "../pdf/browser";
import { thumbnailsDeUrls } from "../ficha/thumbnails";
import { renderRdoHtml, type DadosRdoPdf, type DispositivoInstaladoLink } from "./template";

const log = logger.child({ modulo: "rdo/gerarPdf" });

export type GerarRdoPdfResult =
  | { ok: true; pdfBuffer: Buffer; data: string | null; responsavel: string | null }
  | { ok: false; motivo: string };

// Resolves the devices installed on a given date (optionally scoped to the
// central parsed from the RDO's free-text central field), each with a gallery
// link. Mirrors GET /alarme/dispositivos-instalados so the PDF and dashboard
// agree. Never throws.
async function dispositivosInstaladosDoDia(
  dataISO: string | null,
  centralTexto: string | null
): Promise<DispositivoInstaladoLink[]> {
  if (!dataISO) return [];

  let centralId: string | undefined;
  const m = String(centralTexto ?? "").match(/\b([1-4])\b/);
  if (m) {
    const { data: c } = await supabaseAdmin
      .from("centrais").select("id").eq("numero", Number(m[1])).maybeSingle();
    if (c) centralId = (c as any).id;
  }

  let q = supabaseAdmin
    .from("dispositivos_alarme")
    .select("id, laco, endereco, tipo_dispositivo, setor, fotos")
    .eq("ativo", true)
    .eq("data_instalacao", dataISO)
    .order("setor");
  if (centralId) q = q.eq("central_id", centralId);

  const { data, error } = await q;
  if (error) {
    log.warn({ err: error.message }, "falha ao resolver dispositivos instalados do dia para o PDF");
    return [];
  }
  return (data ?? []).map((dvc: any) => ({
    setor: dvc.setor ?? null,
    endereco: dvc.endereco ?? null,
    laco: dvc.laco ?? null,
    tipo_dispositivo: dvc.tipo_dispositivo,
    qtd_fotos: (dvc.fotos ?? []).length,
    link_galeria: `/alarme/fotos?data=${encodeURIComponent(dataISO)}`,
  }));
}

export async function gerarRdoPdf(rdoId: string): Promise<GerarRdoPdfResult> {
  const { data: rdo, error } = await supabaseAdmin
    .from("rdos").select("*").eq("id", rdoId).maybeSingle();
  if (error) {
    log.error({ err: error.message, rdoId }, "erro ao carregar RDO para PDF");
    return { ok: false, motivo: "Erro ao carregar o RDO." };
  }
  if (!rdo) return { ok: false, motivo: "RDO não encontrado." };

  const r = rdo as any;

  // Downscale the day's photos to small inline data-URIs (keeps the PDF light).
  const fotos: string[] = Array.isArray(r.fotos_dia) ? r.fotos_dia.filter(Boolean) : [];
  const thumbMap = fotos.length ? await thumbnailsDeUrls(fotos) : new Map<string, string>();
  const fotosDataUris = fotos.map((u) => thumbMap.get(u)).filter((x): x is string => !!x);

  const dispositivosInstalados = await dispositivosInstaladosDoDia(r.data ?? null, r.central ?? null);

  const dashboardBaseUrl =
    process.env.DASHBOARD_BASE_URL?.trim() ||
    process.env.FRONTEND_BASE_URL?.trim() ||
    (process.env.CORS_ORIGINS?.split(",")[0]?.trim() ?? "") ||
    null;

  const dados: DadosRdoPdf = {
    numeroRdo: r.pt_numero ? null : null, // no separate sequential number column; leave blank
    data: r.data ?? null,
    responsavel: r.responsavel ?? null,
    periodo: r.periodo ?? null,
    clima: r.clima ?? null,
    central: r.central ?? null,
    laco: r.laco ?? null,
    frente_trabalho: r.frente_trabalho ?? null,
    efetivo: r.efetivo ?? null,
    atividades: r.atividades ?? null,
    dispositivos_instalados: r.dispositivos_instalados ?? null,
    pt_numero: r.pt_numero ?? null,
    integracao_novos: r.integracao_novos ?? null,
    ocorrencias: r.ocorrencias ?? null,
    atrasos: r.atrasos ?? null,
    planejamento_proximo_dia: r.planejamento_proximo_dia ?? null,
    status: r.status ?? null,
    fotosDataUris,
    dispositivosInstalados,
    dashboardBaseUrl,
  };

  const html = renderRdoHtml(dados);
  try {
    const pdfBuffer = await renderPdfFromHtml(html);
    log.info({ rdoId, fotos: fotosDataUris.length, dispositivos: dispositivosInstalados.length }, "PDF de RDO gerado");
    return { ok: true, pdfBuffer, data: r.data ?? null, responsavel: r.responsavel ?? null };
  } catch (err: any) {
    log.error({ err: err.message, rdoId }, "falha ao renderizar PDF do RDO");
    return { ok: false, motivo: "Falha ao renderizar o PDF do RDO." };
  }
}
