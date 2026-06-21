// Minimal plain-text email sender (Resend) for system alerts. Reuses the same
// Resend key/sender resolution as the ficha email path. Never throws.

import { Resend } from "resend";
import { logger } from "../logger";
import { getSecret } from "../segredos/getSecret";

const log = logger.child({ modulo: "notificacao/enviarEmailSimples" });

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function enviarEmailSimples(
  para: string,
  assunto: string,
  corpo: string
): Promise<boolean> {
  let apiKey: string, from: string;
  try {
    apiKey = await getSecret("RESEND_API_KEY");
    from = await getSecret("RESEND_FROM").catch(() => "Sistema Mansur <onboarding@resend.dev>");
  } catch (err: any) {
    log.error({ err: err.message }, "RESEND_API_KEY ausente — alerta por e-mail cancelado");
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">${
      escapeHtml(corpo).replace(/\n/g, "<br/>")
    }</div>`;
    const { error } = await resend.emails.send({ from, to: para.trim(), subject: assunto, html });
    if (error) {
      log.error({ erro: error }, "falha ao enviar alerta por e-mail");
      return false;
    }
    return true;
  } catch (err: any) {
    log.error({ err: err.message }, "erro ao enviar alerta por e-mail");
    return false;
  }
}
