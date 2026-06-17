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
