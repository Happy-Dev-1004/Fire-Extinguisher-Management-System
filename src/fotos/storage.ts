// Uploads a manually-added inspection photo to Supabase Storage and returns its
// public URL. The image is downscaled+recompressed first (same as report
// thumbnails) so stored files stay small. Used by the dashboard "Adicionar
// fotos" feature — a human safety net when WhatsApp grouping misses a photo.

import sharp from "sharp";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";

const log = logger.child({ modulo: "fotos/storage" });

export const BUCKET = "fotos-extintores";
const MAX_WIDTH = 1280;       // bigger than report thumbs — these are the source photos
const JPEG_QUALITY = 72;

// Accepts a data-URI or bare base64 string, downscales to JPEG, uploads under
// extintores/<extintorId>/<unique>.jpg, returns the public URL (or null on fail).
export async function uploadFotoExtintor(
  extintorId: string,
  base64: string,
  uniqueSuffix: string
): Promise<string | null> {
  try {
    const raw = base64.replace(/^data:[^;]+;base64,/, "");
    const input = Buffer.from(raw, "base64");
    const jpeg = await sharp(input)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    const path = `extintores/${extintorId}/${uniqueSuffix}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });

    if (error) {
      log.error({ extintorId, err: error.message }, "falha ao subir foto para o storage");
      return null;
    }
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    log.error({ extintorId, err: err.message }, "erro ao processar/subir foto");
    return null;
  }
}

// Generic base64 uploader: downscales a data-URI/base64 image and stores it
// under <prefixo>/<suffix>.jpg. Returns the public URL or null. Used by the
// device-photo dashboard attach (prefixo = "dispositivos/<id>").
export async function uploadFotoBase64(
  prefixo: string,
  base64: string,
  uniqueSuffix: string
): Promise<string | null> {
  try {
    const raw = base64.replace(/^data:[^;]+;base64,/, "");
    const input = Buffer.from(raw, "base64");
    const jpeg = await sharp(input)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    const path = `${prefixo}/${uniqueSuffix}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (error) {
      log.error({ prefixo, err: error.message }, "falha ao subir foto (base64) para o storage");
      return null;
    }
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    log.error({ prefixo, err: err.message }, "erro ao processar/subir foto (base64)");
    return null;
  }
}

// Fetches a photo from a URL (e.g. a Z-API WhatsApp image), downscales it, and
// uploads to Supabase Storage under <prefixo>/<suffix>.jpg. Returns the public
// URL, or null on failure. Used by the RDO flow to persist the day's photos.
export async function uploadFotoUrl(
  prefixo: string,
  imageUrl: string,
  suffix: string
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      log.warn({ imageUrl, status: res.status }, "falha ao baixar foto do url");
      return null;
    }
    const input = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(input)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    const path = `${prefixo}/${suffix}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (error) {
      log.error({ prefixo, err: error.message }, "falha ao subir foto (url) para o storage");
      return null;
    }
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err: any) {
    log.error({ prefixo, err: err.message }, "erro ao processar/subir foto (url)");
    return null;
  }
}
