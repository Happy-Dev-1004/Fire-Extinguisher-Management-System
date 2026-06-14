import { Router, Request, Response } from "express";
import { z } from "zod";
import { generateFicha } from "../ficha/gerar";
import { buildSampleData } from "../ficha/sample";
import { renderHtml } from "../ficha/template";
import { logger } from "../logger";
import { resolverDestinatarios } from "../destinatarios/resolver";
import { enviarFichaWhatsApp } from "../notificacao/enviarFicha";
import { enviarFichaEmail } from "../notificacao/enviarFichaEmail";
import { renderPdfFromHtml } from "../pdf/browser";

const router = Router();

// GET /ficha?unidade=Itabuna&mes=Maio/2026
// Returns the PDF for the given site + month.
// Append &sample=true to render placeholder data without hitting the DB.
router.get("/", async (req: Request, res: Response) => {
  const unidade = (req.query.unidade as string | undefined)?.trim();
  const mes     = (req.query.mes     as string | undefined)?.trim();
  const sample  = req.query.sample === "true";

  if (!unidade || !mes) {
    return res.status(400).json({ error: "Parâmetros obrigatórios: unidade e mes (ex: Maio/2026)" });
  }

  const log = logger.child({ rota: "/ficha", unidade, mes });

  if (sample) {
    log.info("gerando ficha de amostra (sem banco de dados)");
    try {
      const dados = buildSampleData(unidade, mes);
      const pdf   = await renderPdfFromHtml(renderHtml(dados));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="ficha_${unidade}_${mes}.pdf"`);
      return res.send(pdf);
    } catch (err: any) {
      log.error({ err: err.message }, "falha ao gerar ficha de amostra");
      return res.status(500).json({ error: `Falha ao gerar PDF: ${err.message}` });
    }
  }

  const result = await generateFicha({ unidade, mesReferencia: mes });

  if (!result.ok) {
    log.warn({ motivo: result.motivo }, "ficha não gerada");
    return res.status(404).json({ error: result.motivo });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="ficha_${unidade}_${mes}.pdf"`);
  return res.send(result.pdfBuffer);
});

// ── GET /ficha/destinatarios?unidade=X ────────────────────────────────────────
// Preview which recipients will receive the ficha for a given site.
// Used by the confirmation modal in the frontend before the actual send.
router.get("/destinatarios", async (req: Request, res: Response) => {
  const unidade = (req.query.unidade as string | undefined)?.trim();
  if (!unidade) {
    return res.status(400).json({ erro: "Parâmetro obrigatório: unidade" });
  }

  const destinatarios = await resolverDestinatarios(unidade);
  return res.json({ unidade, destinatarios });
});

// ── POST /ficha/enviar ────────────────────────────────────────────────────────
// Generates the PDF and sends it via WhatsApp to all resolved recipients.
// 422 if no active recipients are configured for the unidade.
const EnviarBodySchema = z.object({
  unidade: z.string().min(1, "Unidade é obrigatória."),
  mes:     z.string().min(1, "Mês é obrigatório. Formato: Mês/AAAA (ex: Maio/2026)."),
  // Which channel(s) to send through. Defaults to "ambos" (both) so existing
  // callers keep their current behaviour.
  canal:   z.enum(["whatsapp", "email", "ambos"]).default("ambos"),
});

router.post("/enviar", async (req: Request, res: Response) => {
  const parsed = EnviarBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: parsed.error.flatten().fieldErrors });
  }
  const { unidade, mes, canal } = parsed.data;
  const log = logger.child({ rota: "/ficha/enviar", unidade, mes, canal });

  // Resolve recipients server-side — never trusts a client-provided list.
  const destinatarios = await resolverDestinatarios(unidade);
  if (destinatarios.length === 0) {
    log.warn("envio bloqueado: nenhum destinatário ativo");
    return res.status(422).json({
      erro: `Nenhum destinatário configurado para a unidade "${unidade}". Cadastre ao menos um destinatário ativo antes de enviar.`,
    });
  }

  // Generate the PDF.
  const result = await generateFicha({ unidade, mesReferencia: mes });
  if (!result.ok) {
    log.warn({ motivo: result.motivo }, "falha ao gerar PDF para envio");
    return res.status(404).json({ erro: result.motivo });
  }

  // Dispatch to BOTH channels. Each recipient may have a phone, an email, or
  // both — every available channel is always attempted, independently.
  const { pdfBuffer } = result;

  // Honour the requested channel: only dispatch through the channels the
  // caller asked for. "ambos" attempts both; "whatsapp"/"email" restrict to one.
  const usarWhats = canal === "ambos" || canal === "whatsapp";
  const usarEmail = canal === "ambos" || canal === "email";

  const comTelefone = usarWhats ? destinatarios.filter((d) => d.telefone_normalizado)      : [];
  const comEmail    = usarEmail ? destinatarios.filter((d) => d.email && d.email.trim())   : [];

  const [resWhats, resEmail] = await Promise.all([
    comTelefone.length ? enviarFichaWhatsApp({ unidade, mes, pdfBuffer, destinatarios: comTelefone }) : Promise.resolve([]),
    comEmail.length    ? enviarFichaEmail({ unidade, mes, pdfBuffer, destinatarios: comEmail })       : Promise.resolve([]),
  ]);

  // Merge into one row per recipient, carrying each channel's status.
  const whatsById = new Map(resWhats.map((r) => [r.destinatario.id, r]));
  const emailById = new Map(resEmail.map((r) => [r.destinatario.id, r]));

  const detalhes = destinatarios.map((d) => {
    const w = whatsById.get(d.id);
    const e = emailById.get(d.id);
    return {
      destinatario: { id: d.id, nome: d.nome, telefone: d.telefone, email: d.email ?? null },
      whatsapp: (usarWhats && d.telefone_normalizado)
        ? { tentado: true, ok: w?.ok ?? false, motivo: w?.motivo }
        : { tentado: false, ok: false },
      email: (usarEmail && d.email && d.email.trim())
        ? { tentado: true, ok: e?.ok ?? false, motivo: e?.motivo }
        : { tentado: false, ok: false },
    };
  });

  // A recipient is "fully delivered" only if every channel they have succeeded.
  const sucessoCompleto = detalhes.filter(
    (d) => (!d.whatsapp.tentado || d.whatsapp.ok) && (!d.email.tentado || d.email.ok)
  ).length;
  const comFalha = detalhes.length - sucessoCompleto;

  const whatsOk = resWhats.filter((r) => r.ok).length;
  const emailOk = resEmail.filter((r) => r.ok).length;

  log.info(
    { total: destinatarios.length, sucessoCompleto, comFalha, whatsOk, emailOk },
    "ficha enviada (whatsapp + e-mail)"
  );

  return res.json({
    mensagem: `Ficha entregue a ${sucessoCompleto} de ${destinatarios.length} destinatário(s) (WhatsApp: ${whatsOk}, e-mail: ${emailOk}).`,
    enviados: sucessoCompleto,
    falhas:   comFalha,
    detalhes,
  });
});

export default router;
