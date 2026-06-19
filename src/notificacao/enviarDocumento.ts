// Generic document delivery — WhatsApp (Z-API send-document) + email (Resend).
//
// Extracted from enviarFicha/enviarFichaEmail so any PDF (ficha, RDO, …) can be
// sent to recipients with the same retry/never-throw semantics and per-recipient
// result rows. The ficha senders are thin wrappers over these.

import { Resend } from "resend";
import { logger } from "../logger";
import { getSecret } from "../segredos/getSecret";
import type { DestinatarioResolvido } from "../destinatarios/resolver";
import type { ResultadoEnvio } from "./enviarFicha";

const log = logger.child({ modulo: "notificacao/enviarDocumento" });

const MAX_TENTATIVAS = 3;
const BACKOFF_MS = [1_000, 3_000, 7_000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface DocumentoWhatsApp {
  pdfBuffer: Buffer;
  fileName: string;             // e.g. "rdo_2026-06-18.pdf"
  caption: string;              // pt-BR caption shown with the document
  destinatarios: DestinatarioResolvido[];
}

export async function enviarDocumentoWhatsApp(input: DocumentoWhatsApp): Promise<ResultadoEnvio[]> {
  let instanceId: string, token: string, clientToken: string;
  try {
    [instanceId, token, clientToken] = await Promise.all([
      getSecret("ZAPI_INSTANCE_ID"),
      getSecret("ZAPI_TOKEN"),
      getSecret("ZAPI_CLIENT_TOKEN"),
    ]);
  } catch (err: any) {
    log.error({ err: err.message }, "configuração Z-API ausente — envio de documento cancelado");
    return input.destinatarios.map((d) => ({
      destinatario: { id: d.id, nome: d.nome, telefone: d.telefone },
      ok: false,
      motivo: "Configuração Z-API ausente.",
    }));
  }

  // Z-API requires the document as a data-URI (not bare base64) and the path
  // extension must match the type (.../send-document/pdf).
  const base64Pdf = `data:application/pdf;base64,${input.pdfBuffer.toString("base64")}`;
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-document/pdf`;

  const resultados: ResultadoEnvio[] = [];
  for (const dest of input.destinatarios) {
    const destLog = log.child({ destinatarioId: dest.id, telefone: dest.telefone });
    let ok = false, motivo: string | undefined;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Client-Token": clientToken },
          body: JSON.stringify({
            phone: dest.telefone_normalizado,
            document: base64Pdf,
            fileName: input.fileName,
            caption: input.caption,
          }),
        });
        if (response.ok) { ok = true; destLog.info({ tentativa }, "documento enviado"); break; }

        const status = response.status;
        const detalhe = await response.text().catch(() => "");
        if (status < 500 && status !== 429) {
          motivo = `Z-API erro ${status}: ${detalhe}`;
          destLog.error({ status, detalhe }, "falha ao enviar documento — erro do cliente");
          break;
        }
        destLog.warn({ status, tentativa }, "Z-API erro transitório — retry");
      } catch (err: any) {
        destLog.warn({ err: err.message, tentativa }, "Z-API inacessível — retry");
        motivo = err.message;
      }
      if (tentativa < MAX_TENTATIVAS) await sleep(BACKOFF_MS[tentativa - 1] ?? 7_000);
    }
    if (!ok && !motivo) motivo = "Todas as tentativas esgotadas.";
    resultados.push({ destinatario: { id: dest.id, nome: dest.nome, telefone: dest.telefone }, ok, motivo });
  }
  return resultados;
}

export interface DocumentoEmail {
  pdfBuffer: Buffer;
  fileName: string;
  assunto: string;
  // Builds the HTML body for a recipient (so each gets a personalised greeting).
  corpoHtml: (nome: string) => string;
  destinatarios: DestinatarioResolvido[]; // only those with an email are used
}

export async function enviarDocumentoEmail(input: DocumentoEmail): Promise<ResultadoEnvio[]> {
  const comEmail = input.destinatarios.filter((d) => d.email && d.email.trim());
  if (comEmail.length === 0) return [];

  let apiKey: string, from: string;
  try {
    apiKey = await getSecret("RESEND_API_KEY");
    from = await getSecret("RESEND_FROM").catch(() => "Extintores <onboarding@resend.dev>");
  } catch (err: any) {
    log.error({ err: err.message }, "RESEND_API_KEY ausente — envio de e-mail cancelado");
    return comEmail.map((d) => ({
      destinatario: { id: d.id, nome: d.nome, telefone: d.telefone },
      ok: false,
      motivo: "Configuração de e-mail (Resend) ausente.",
    }));
  }

  const resend = new Resend(apiKey);
  const base64Pdf = input.pdfBuffer.toString("base64");
  const resultados: ResultadoEnvio[] = [];

  for (const dest of comEmail) {
    const destLog = log.child({ destinatarioId: dest.id, email: dest.email });
    let ok = false, motivo: string | undefined;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        const { error } = await resend.emails.send({
          from,
          to: dest.email!.trim(),
          subject: input.assunto,
          html: input.corpoHtml(escapeHtml(dest.nome)),
          attachments: [{ filename: input.fileName, content: base64Pdf }],
        });
        if (!error) { ok = true; destLog.info({ tentativa }, "documento enviado por e-mail"); break; }

        const rawMsg = error.message ?? error.name ?? "erro desconhecido";
        motivo = /domain is not verified|not verified|verify a domain/i.test(rawMsg)
          ? "Domínio do remetente ainda não verificado no Resend."
          : `Resend: ${rawMsg}`;
        destLog.error({ erro: error }, "falha ao enviar e-mail");
        break;
      } catch (err: any) {
        destLog.warn({ err: err.message, tentativa }, "Resend inacessível — retry");
        motivo = err.message;
      }
      if (tentativa < MAX_TENTATIVAS) await sleep(BACKOFF_MS[tentativa - 1] ?? 7_000);
    }
    if (!ok && !motivo) motivo = "Todas as tentativas esgotadas.";
    resultados.push({ destinatario: { id: dest.id, nome: dest.nome, telefone: dest.email ?? "" }, ok, motivo });
  }
  return resultados;
}
