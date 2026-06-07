import { Router, Request, Response } from "express";
import { generateFicha } from "../ficha/gerar";
import { buildSampleData } from "../ficha/sample";
import { renderHtml } from "../ficha/template";
import { logger } from "../logger";

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
      const { chromium } = await import("playwright");
      const dados = buildSampleData(unidade, mes);
      const html  = renderHtml(dados);
      const browser = await chromium.launch({ headless: true, channel: "chrome" });
      const page    = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
      });
      await browser.close();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="ficha_${unidade}_${mes}.pdf"`);
      return res.send(Buffer.from(pdf));
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

export default router;
