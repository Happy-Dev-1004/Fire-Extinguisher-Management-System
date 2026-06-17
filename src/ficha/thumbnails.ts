// Server-side photo downscaling for reports.
//
// The ficha report embeds the inspection photos. Embedding the FULL-SIZE remote
// images makes Chromium download hundreds of multi-MB files and decode them at
// full resolution → the container runs out of memory and is killed (SIGTERM).
//
// Instead we fetch each photo once, downscale + recompress it to a small JPEG,
// and return it as a base64 data-URI. Chromium then loads tiny inline images
// (no network, low memory), so the report keeps ALL photos but stays light.
//
// Concurrency is capped and a tiny in-memory cache avoids re-fetching the same
// URL across rows / repeated report generations within the process lifetime.

import sharp from "sharp";
import { logger } from "../logger";

const log = logger.child({ modulo: "ficha/thumbnails" });

// Target: ~520px wide, JPEG q60 — legible for a report, ~20-40 KB each instead
// of multiple MB. Tune here if needed.
const MAX_WIDTH = 520;
const JPEG_QUALITY = 60;
const FETCH_TIMEOUT_MS = 15_000;
const CONCORRENCIA = 4;

// Cache by URL → data-URI for the life of the process.
const cache = new Map<string, string>();

async function fetchBuffer(url: string): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      log.warn({ url, status: res.status }, "falha ao baixar foto para thumbnail");
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err: any) {
    log.warn({ url, err: err.message }, "erro ao baixar foto para thumbnail");
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Downscales one image URL to a small JPEG data-URI. Returns null on failure so
// the caller can skip a broken photo without aborting the whole report.
export async function urlParaThumbnail(url: string): Promise<string | null> {
  const cached = cache.get(url);
  if (cached !== undefined) return cached;

  const buf = await fetchBuffer(url);
  if (!buf) return null;

  try {
    const out = await sharp(buf)
      .rotate()                                   // honour EXIF orientation
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    const dataUri = `data:image/jpeg;base64,${out.toString("base64")}`;
    cache.set(url, dataUri);
    return dataUri;
  } catch (err: any) {
    log.warn({ url, err: err.message }, "erro ao redimensionar foto");
    return null;
  }
}

// Downscales many URLs with bounded concurrency. Returns a map url → data-URI
// (failed ones are omitted). Order is irrelevant to the caller.
export async function thumbnailsDeUrls(urls: string[]): Promise<Map<string, string>> {
  const unicas = [...new Set(urls.filter(Boolean))];
  const result = new Map<string, string>();
  let i = 0;

  async function worker() {
    while (i < unicas.length) {
      const idx = i++;
      const url = unicas[idx];
      const thumb = await urlParaThumbnail(url);
      if (thumb) result.set(url, thumb);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, unicas.length) }, worker));
  return result;
}
