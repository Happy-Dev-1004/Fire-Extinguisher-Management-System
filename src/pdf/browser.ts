// Shared Chromium launcher for PDF generation.
//
// Local dev (Windows) often has system Chrome installed, which Playwright can
// drive via channel:"chrome". On a Linux host (Railway) we rely on Playwright's
// OWN bundled Chromium (installed with `npx playwright install chromium`), which
// has no channel. We try bundled Chromium first (works everywhere a build ran
// `playwright install`), and fall back to system Chrome only if that fails.
//
// PLAYWRIGHT_CHROME_CHANNEL can force a channel (e.g. "chrome") when needed.

import type { Browser } from "playwright";
import { logger } from "../logger";

const log = logger.child({ modulo: "pdf/browser" });

const LINUX_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

export async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  const forcedChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL?.trim();

  // On non-Windows hosts, sandbox flags are required to run as root in a container.
  const args = process.platform === "win32" ? [] : LINUX_ARGS;

  if (forcedChannel) {
    return chromium.launch({ headless: true, channel: forcedChannel, args });
  }

  // Preferred: Playwright's bundled Chromium (no channel). Works on Railway.
  try {
    return await chromium.launch({ headless: true, args });
  } catch (errBundled: any) {
    log.warn(
      { err: errBundled.message },
      "Chromium empacotado indisponível — tentando channel:chrome (Chrome do sistema)"
    );
    // Fallback: system Chrome (common on local Windows dev machines).
    return chromium.launch({ headless: true, channel: "chrome", args });
  }
}

export async function renderPdfFromHtml(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
