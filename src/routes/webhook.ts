import { Router, Request, Response } from "express";
import { supabase } from "../db";
import { supabaseAdmin } from "../db-admin";
import { normalizar } from "../inspetores/normalizar";

const router = Router();

// Per-phone queue: ensures messages from the same inspector
// are processed one at a time, never in parallel.
// This prevents race conditions when photos arrive in quick succession.
const filas = new Map<string, Promise<void>>();

function enqueueForPhone(phone: string, task: () => Promise<void>): void {
  const anterior = filas.get(phone) ?? Promise.resolve();
  const proxima = anterior.then(task).catch((err) =>
    console.error(`Erro na fila de ${phone}:`, err)
  );
  filas.set(phone, proxima);
}

// Checks the inspetores table for an active record with the same normalized
// number. Returns true if authorized, false otherwise.
export async function isAuthorized(phone: string): Promise<boolean> {
  let normalizado: string;
  try {
    normalizado = normalizar(phone);
  } catch {
    // Phone has too few digits to be valid — definitely not authorized
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("inspetores")
    .select("id")
    .eq("telefone_normalizado", normalizado)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    console.error("Erro ao verificar autorização no banco:", error.message);
    return false;
  }

  return data !== null;
}

router.post("/", (req: Request, res: Response) => {
  // Always respond 200 immediately so Z-API stops retrying
  res.status(200).json({ received: true });

  const body = req.body;
  const phone: string | undefined = body?.phone ?? body?.message?.phone;

  if (phone) {
    enqueueForPhone(phone, () => processWebhook(body));
  } else {
    processWebhook(body).catch((err) =>
      console.error("Erro ao processar webhook:", err)
    );
  }
});

async function processWebhook(body: any): Promise<void> {
  console.log("=== Webhook recebido ===");
  console.log(JSON.stringify(body, null, 2));

  // Z-API wraps the message inside body.message for most types
  const phone: string | undefined =
    body?.phone ?? body?.message?.phone;

  const timestamp: number | undefined =
    body?.momment ?? body?.message?.momment;

  const isImage: boolean =
    body?.type === "ReceivedCallback" &&
    (body?.image != null || body?.message?.imageMessage != null);

  const imageUrl: string | undefined =
    body?.image?.imageUrl ?? body?.message?.imageMessage?.url;

  // Treat empty string as no caption
  const rawCaption: string | undefined =
    body?.image?.caption ?? body?.message?.imageMessage?.caption;
  const caption: string | undefined =
    rawCaption && rawCaption.trim() !== "" ? rawCaption.trim() : undefined;

  console.log("--- Campos extraídos ---");
  console.log("Telefone :", phone ?? "não encontrado");
  console.log("Timestamp:", timestamp ?? "não encontrado");
  console.log("É imagem :", isImage);
  if (isImage) {
    console.log("URL imagem:", imageUrl ?? "não encontrada");
    console.log("Legenda   :", caption ?? "sem legenda");
  }

  // Authorization: the incoming number (normalized) must match an active inspector.
  if (!phone || !(await isAuthorized(phone))) {
    console.log(`⚠ Número não autorizado: ${phone ?? "desconhecido"} — mensagem ignorada`);
    return;
  }

  console.log(`✓ Número autorizado: ${phone}`);

  if (!isImage || !imageUrl) {
    console.log("Mensagem não é uma imagem — ignorada");
    return;
  }

  if (caption) {
    await handleImageWithCaption(phone, caption, imageUrl);
  } else {
    await handleImageWithoutCaption(phone, imageUrl);
  }
}

// An image WITH a caption = start of a new extinguisher batch.
// Close any open batch for this phone first, then open a new one.
async function handleImageWithCaption(
  phone: string,
  caption: string,
  imageUrl: string
): Promise<void> {
  console.log(`📋 Nova legenda recebida: "${caption}" — iniciando novo lote`);

  // Close the current open batch for this phone, if there is one
  const { data: loteAberto } = await supabase
    .from("lotes_fotos")
    .select("id, legenda, fotos")
    .eq("phone", phone)
    .eq("status", "aberto")
    .maybeSingle();

  if (loteAberto) {
    await supabase
      .from("lotes_fotos")
      .update({ status: "pronto" })
      .eq("id", loteAberto.id);

    console.log(
      `✅ Lote anterior finalizado: extintor "${loteAberto.legenda}" — ${loteAberto.fotos.length} foto(s) — status: pronto`
    );
  }

  // Open a new batch with this first photo
  const { data: novoLote, error } = await supabase
    .from("lotes_fotos")
    .insert({
      phone,
      legenda: caption,
      fotos: [imageUrl],
      status: "aberto",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar novo lote:", error.message);
    return;
  }

  console.log(`📂 Novo lote aberto: extintor "${caption}" — id: ${novoLote.id}`);
}

// An image WITHOUT a caption = append to the current open batch.
async function handleImageWithoutCaption(
  phone: string,
  imageUrl: string
): Promise<void> {
  const { data: loteAberto, error: fetchError } = await supabase
    .from("lotes_fotos")
    .select("id, legenda, fotos")
    .eq("phone", phone)
    .eq("status", "aberto")
    .maybeSingle();

  if (fetchError) {
    console.error("Erro ao buscar lote aberto:", fetchError.message);
    return;
  }

  if (!loteAberto) {
    console.log(`⚠ Nenhum lote aberto para ${phone} — foto sem legenda descartada`);
    return;
  }

  const fotosAtualizadas = [...loteAberto.fotos, imageUrl];

  const { error: updateError } = await supabase
    .from("lotes_fotos")
    .update({ fotos: fotosAtualizadas })
    .eq("id", loteAberto.id);

  if (updateError) {
    console.error("Erro ao adicionar foto ao lote:", updateError.message);
    return;
  }

  console.log(
    `📸 Foto adicionada ao lote "${loteAberto.legenda}" — total: ${fotosAtualizadas.length} foto(s)`
  );
}

export default router;
