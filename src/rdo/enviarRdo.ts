// Multi-channel RDO delivery: generates the PDF and sends it to the resolved
// recipients via WhatsApp and/or email, aggregating one result row per
// recipient (same shape as /ficha/enviar). Never throws; no photo/data loss.

import { logger } from "../logger";
import { resolverDestinatarios } from "../destinatarios/resolver";
import { enviarDocumentoWhatsApp, enviarDocumentoEmail } from "../notificacao/enviarDocumento";
import { gerarRdoPdf } from "./gerarPdf";

const log = logger.child({ modulo: "rdo/enviarRdo" });

export type Canal = "whatsapp" | "email" | "ambos";

// Recipient scope for RDOs. RDO recipients (e.g. the contract manager) are
// configured in the same destinatarios table under this unidade tag, plus the
// global '*' rows. Keeping a dedicated tag lets RDO and ficha lists differ.
export const UNIDADE_RDO = "RDO";

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export interface ResultadoEnvioRdo {
  ok: boolean;
  status: number;                 // suggested HTTP status for the route
  mensagem?: string;
  erro?: string;
  enviados?: number;
  falhas?: number;
  detalhes?: unknown[];
}

export async function enviarRdo(rdoId: string, canal: Canal): Promise<ResultadoEnvioRdo> {
  const destinatarios = await resolverDestinatarios(UNIDADE_RDO);
  if (destinatarios.length === 0) {
    return {
      ok: false,
      status: 422,
      erro:
        `Nenhum destinatário configurado para RDO (unidade "${UNIDADE_RDO}"). ` +
        `Cadastre ao menos um destinatário ativo nessa unidade (ou em "*") antes de enviar.`,
    };
  }

  const pdf = await gerarRdoPdf(rdoId);
  if (!pdf.ok) return { ok: false, status: 404, erro: pdf.motivo };

  const dataStr = dataBR(pdf.data);
  const fileName = `rdo_${(pdf.data ?? "sem-data").replace(/\//g, "-")}.pdf`;
  const caption = `RDO — Sistema de alarme — ${dataStr}${pdf.responsavel ? ` — ${pdf.responsavel}` : ""}`;
  const assunto = `RDO — Sistema de alarme de incêndio — ${dataStr}`;

  const usarWhats = canal === "ambos" || canal === "whatsapp";
  const usarEmail = canal === "ambos" || canal === "email";

  const comTelefone = usarWhats ? destinatarios.filter((d) => d.telefone_normalizado) : [];
  const comEmail = usarEmail ? destinatarios.filter((d) => d.email && d.email.trim()) : [];

  const [resWhats, resEmail] = await Promise.all([
    comTelefone.length
      ? enviarDocumentoWhatsApp({ pdfBuffer: pdf.pdfBuffer, fileName, caption, destinatarios: comTelefone })
      : Promise.resolve([]),
    comEmail.length
      ? enviarDocumentoEmail({
          pdfBuffer: pdf.pdfBuffer,
          fileName,
          assunto,
          corpoHtml: (nome) =>
            `<p>Olá, ${nome}.</p>` +
            `<p>Segue em anexo o Relatório Diário de Obra (RDO) do sistema de alarme de incêndio ` +
            `referente a <strong>${dataStr}</strong>.</p>` +
            `<p>Atenciosamente,<br/>Mansur — Gestão de Alarme de Incêndio</p>`,
          destinatarios: comEmail,
        })
      : Promise.resolve([]),
  ]);

  const whatsById = new Map(resWhats.map((r) => [r.destinatario.id, r]));
  const emailById = new Map(resEmail.map((r) => [r.destinatario.id, r]));

  const detalhes = destinatarios.map((d) => {
    const w = whatsById.get(d.id);
    const e = emailById.get(d.id);
    return {
      destinatario: { id: d.id, nome: d.nome, telefone: d.telefone, email: d.email ?? null },
      whatsapp: usarWhats && d.telefone_normalizado
        ? { tentado: true, ok: w?.ok ?? false, motivo: w?.motivo }
        : { tentado: false, ok: false },
      email: usarEmail && d.email && d.email.trim()
        ? { tentado: true, ok: e?.ok ?? false, motivo: e?.motivo }
        : { tentado: false, ok: false },
    };
  });

  const sucessoCompleto = detalhes.filter(
    (d) => (!d.whatsapp.tentado || d.whatsapp.ok) && (!d.email.tentado || d.email.ok)
  ).length;
  const whatsOk = resWhats.filter((r) => r.ok).length;
  const emailOk = resEmail.filter((r) => r.ok).length;

  log.info({ rdoId, total: destinatarios.length, sucessoCompleto, whatsOk, emailOk }, "RDO enviado");

  return {
    ok: true,
    status: 200,
    mensagem: `RDO entregue a ${sucessoCompleto} de ${destinatarios.length} destinatário(s) (WhatsApp: ${whatsOk}, e-mail: ${emailOk}).`,
    enviados: sucessoCompleto,
    falhas: detalhes.length - sucessoCompleto,
    detalhes,
  };
}
