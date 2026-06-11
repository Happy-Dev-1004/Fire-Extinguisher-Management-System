// Sends the monthly inspection PDF to recipients by email via Resend.
//
// Mirrors enviarFichaWhatsApp: same per-recipient result shape, never throws,
// retries transient failures. The PDF is attached; the body is a short pt-BR
// message. Only recipients that HAVE an email are passed in by the caller.

import { Resend } from "resend";
import { logger } from "../logger";
import { getSecret } from "../segredos/getSecret";
import type { DestinatarioResolvido } from "../destinatarios/resolver";
import type { ResultadoEnvio } from "./enviarFicha";

const log = logger.child({ modulo: "notificacao/enviarFichaEmail" });

const MAX_TENTATIVAS = 3;
const BACKOFF_MS = [1_000, 3_000, 7_000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface EnviarFichaEmailInput {
  unidade:       string;
  mes:           string;
  pdfBuffer:     Buffer;
  destinatarios: DestinatarioResolvido[]; // only those with a non-empty email
}

export async function enviarFichaEmail(input: EnviarFichaEmailInput): Promise<ResultadoEnvio[]> {
  const comEmail = input.destinatarios.filter((d) => d.email && d.email.trim());
  if (comEmail.length === 0) return [];

  let apiKey: string;
  let from: string;
  try {
    apiKey = await getSecret("RESEND_API_KEY");
    // Default to Resend's shared test sender if no verified domain is configured.
    from = await getSecret("RESEND_FROM").catch(() => "Extintores <onboarding@resend.dev>");
  } catch (err: any) {
    log.error({ err: err.message }, "RESEND_API_KEY ausente — envio de e-mail cancelado");
    return comEmail.map((d) => ({
      destinatario: { id: d.id, nome: d.nome, telefone: d.telefone },
      ok: false,
      motivo: "Configuração de e-mail (Resend) ausente.",
    }));
  }

  const resend    = new Resend(apiKey);
  const fileName  = `ficha_${input.unidade.replace(/\s+/g, "_")}_${input.mes.replace("/", "-")}.pdf`;
  const assunto   = `Ficha de inspeção de extintores — ${input.unidade} — ${input.mes}`;
  const base64Pdf = input.pdfBuffer.toString("base64");

  log.info(
    { unidade: input.unidade, mes: input.mes, qtdDestinatarios: comEmail.length },
    "enviando ficha por e-mail"
  );

  const resultados: ResultadoEnvio[] = [];

  for (const dest of comEmail) {
    const destLog = log.child({ destinatarioId: dest.id, nome: dest.nome, email: dest.email });
    let ok = false;
    let motivo: string | undefined;

    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        const { error } = await resend.emails.send({
          from,
          to: dest.email!.trim(),
          subject: assunto,
          html:
            `<p>Olá, ${escapeHtml(dest.nome)}.</p>` +
            `<p>Segue em anexo a ficha de inspeção mensal dos extintores da unidade ` +
            `<strong>${escapeHtml(input.unidade)}</strong> referente a <strong>${escapeHtml(input.mes)}</strong>.</p>` +
            `<p>Atenciosamente,<br/>Sistema de Gestão de Extintores</p>`,
          attachments: [{ filename: fileName, content: base64Pdf }],
        });

        if (!error) {
          destLog.info({ tentativa }, "ficha enviada por e-mail com sucesso");
          ok = true;
          break;
        }

        // Resend returns a structured error object rather than throwing.
        const rawMsg = error.message ?? error.name ?? "erro desconhecido";
        // Make the most common setup error actionable in the dashboard.
        motivo = /domain is not verified|not verified|verify a domain/i.test(rawMsg)
          ? "Domínio do remetente ainda não verificado no Resend."
          : `Resend: ${rawMsg}`;
        destLog.error({ erro: error, tentativa }, "falha ao enviar e-mail");
        // Most Resend errors (invalid address, domain not verified) are permanent.
        break;
      } catch (err: any) {
        destLog.warn({ err: err.message, tentativa }, "Resend inacessível — aguardando retry");
        motivo = err.message;
      }

      if (tentativa < MAX_TENTATIVAS) {
        await sleep(BACKOFF_MS[tentativa - 1] ?? 7_000);
      }
    }

    if (!ok && !motivo) motivo = "Todas as tentativas esgotadas.";

    resultados.push({
      destinatario: { id: dest.id, nome: dest.nome, telefone: dest.email ?? "" },
      ok,
      motivo,
    });
  }

  const enviados = resultados.filter((r) => r.ok).length;
  const falhas   = resultados.filter((r) => !r.ok).length;
  log.info({ unidade: input.unidade, mes: input.mes, enviados, falhas }, "envio de e-mail concluído");

  return resultados;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
