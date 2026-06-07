import { Router, Request, Response } from "express";

const router = Router();

// Replace these with the real inspector phone numbers later.
// Format: country code + area code + number, no spaces or symbols.
// Example: "5573999990000"
const NUMEROS_AUTORIZADOS: string[] = [
  "PLACEHOLDER_NUMERO_1",
  "PLACEHOLDER_NUMERO_2",
];

router.post("/", (req: Request, res: Response) => {
  // Always respond 200 immediately so Z-API stops retrying
  res.status(200).json({ received: true });

  const body = req.body;

  // Log the full raw payload so you can see Z-API's exact shape
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

  const caption: string | undefined =
    body?.image?.caption ?? body?.message?.imageMessage?.caption;

  // Extract the fields we care about
  console.log("--- Campos extraídos ---");
  console.log("Telefone :", phone ?? "não encontrado");
  console.log("Timestamp:", timestamp ?? "não encontrado");
  console.log("É imagem :", isImage);
  if (isImage) {
    console.log("URL imagem:", imageUrl ?? "não encontrada");
    console.log("Legenda   :", caption ?? "sem legenda");
  }

  // Ignore messages from unknown numbers
  if (!phone || !NUMEROS_AUTORIZADOS.includes(phone)) {
    console.log(`⚠ Número não autorizado: ${phone ?? "desconhecido"} — mensagem ignorada`);
    return;
  }

  console.log(`✓ Número autorizado: ${phone}`);

  if (!isImage) {
    console.log("Mensagem não é uma imagem — ignorada por enquanto");
    return;
  }

  console.log("✓ Imagem recebida — pronto para processar");
});

export default router;
