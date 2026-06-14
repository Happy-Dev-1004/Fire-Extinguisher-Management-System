import { Router, Request, Response } from "express";
import { supabase } from "../db";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { normalizar } from "../inspetores/normalizar";
import { analisarLote, type LoteFotos } from "../analise/analisar";

const router = Router();
const log = logger.child({ rota: "webhook" });

// Per-phone queue: ensures messages from the same inspector
// are processed one at a time, never in parallel.
const filas = new Map<string, Promise<void>>();

// Auto-close timer: after BATCH_TIMEOUT_MS of inactivity the batch closes automatically
const BATCH_TIMEOUT_MS = 30_000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function resetBatchTimer(phone: string): void {
  const existing = timers.get(phone);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    timers.delete(phone);
    enqueueForPhone(phone, () => autoFecharLote(phone));
  }, BATCH_TIMEOUT_MS);
  timers.set(phone, t);
}

async function autoFecharLote(phone: string): Promise<void> {
  const { data: lote, error } = await buscarLoteAberto<any>(
    phone,
    "id, legenda, fotos, phone, unidade_contexto, mes_referencia, data_inspecao"
  );

  if (error || !lote) return;

  await supabase.from("lotes_fotos").update({ status: "pronto" }).eq("id", lote.id);
  log.info({ phone, loteId: lote.id, extintor: lote.legenda, qtdFotos: lote.fotos.length }, "lote finalizado por timeout automático");
  triggerAnalise({ ...lote, status: "pronto" });
}

function enqueueForPhone(phone: string, task: () => Promise<void>): void {
  const anterior = filas.get(phone) ?? Promise.resolve();
  const proxima = anterior.then(task).catch((err) =>
    log.error({ phone, err: err.message }, "erro na fila de processamento")
  );
  filas.set(phone, proxima);
}

// Fetches the most-recent open batch for a phone, tolerating duplicates.
//
// The old code used .maybeSingle(), which THROWS "multiple (or no) rows
// returned" whenever more than one 'aberto' row exists for the phone — which
// happens if a batch is opened but never closed (server redeploy mid-batch,
// two photos racing, an abandoned session). That error aborted the handler so
// the incoming photo was silently dropped — never stored, never analysed.
//
// Selecting the newest row with limit(1) instead makes the webhook self-heal:
// it always finds a batch to work with and never crashes on duplicates.
// `colunas` lets callers request the exact columns they need.
async function buscarLoteAberto<T = any>(
  phone: string,
  colunas: string
): Promise<{ data: T | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("lotes_fotos")
    .select(colunas)
    .eq("phone", phone)
    .eq("status", "aberto")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) return { data: null, error };
  return { data: (data?.[0] as T) ?? null, error: null };
}

export async function isAuthorized(phone: string): Promise<boolean> {
  let normalizado: string;
  try {
    normalizado = normalizar(phone);
  } catch {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("inspetores")
    .select("id")
    .eq("telefone_normalizado", normalizado)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    log.error({ err: error.message }, "erro ao verificar autorização no banco");
    return false;
  }

  return data !== null;
}

router.post("/", (req: Request, res: Response) => {
  // Always respond 200 immediately so Z-API stops retrying
  res.status(200).json({ received: true });

  const body = req.body;
  const phone: string | undefined = body?.phone ?? body?.message?.phone;

  // Full body dump for debugging — remove after confirming Z-API payload shape
  log.info({ payload: JSON.stringify(body).slice(0, 800) }, "webhook payload completo");

  log.info(
    {
      phone: phone ?? "desconhecido",
      tipo: body?.type ?? "?",
      temImagem: !!(body?.image ?? body?.message?.imageMessage),
      temTexto: !!(body?.text ?? body?.message?.conversation ?? body?.message?.extendedTextMessage),
    },
    "webhook recebido"
  );

  if (phone) {
    enqueueForPhone(phone, () => processWebhook(body));
  } else {
    processWebhook(body).catch((err) =>
      log.error({ err: err.message }, "erro ao processar webhook sem telefone")
    );
  }
});

async function processWebhook(body: any): Promise<void> {
  const phone: string | undefined = body?.phone ?? body?.message?.phone;

  const isReceivedCallback = body?.type === "ReceivedCallback";

  const isImage: boolean =
    isReceivedCallback &&
    (body?.image != null || body?.message?.imageMessage != null);

  const imageUrl: string | undefined =
    body?.image?.imageUrl ??
    body?.image?.url ??
    body?.message?.imageMessage?.url;

  const rawCaption: string | undefined =
    body?.image?.caption ??
    body?.message?.imageMessage?.caption;
  const caption: string | undefined = rawCaption?.trim() || undefined;

  const isText: boolean =
    isReceivedCallback &&
    (body?.text != null ||
     body?.message?.conversation != null ||
     body?.message?.extendedTextMessage != null);

  const textBody: string | undefined = (
    body?.text?.message ??
    body?.message?.conversation ??
    body?.message?.extendedTextMessage?.text
  )?.trim().toLowerCase();

  if (!phone || !(await isAuthorized(phone))) {
    log.warn({ phone: phone ?? "desconhecido" }, "número não autorizado — mensagem ignorada");
    return;
  }

  log.info({ phone }, "inspetor autorizado");

  const FINALIZADORES = ["fim", "ok", "pronto", "finalizar", "concluir", "done"];
  if (isText && textBody && FINALIZADORES.includes(textBody)) {
    await handleFinalizarLote(phone);
    return;
  }

  // "unidade: Nome da Unidade" — sets the active unit context for this inspector
  if (isText && textBody) {
    const matchUnidade = textBody.match(/^unidade\s*[:\-]\s*(.+)/i);
    if (matchUnidade) {
      const nomeUnidade = matchUnidade[1].trim();
      await supabaseAdmin
        .from("inspetores")
        .update({ unidade_contexto: nomeUnidade })
        .eq("telefone_normalizado", normalizar(phone));
      log.info({ phone, unidade: nomeUnidade }, "unidade de contexto definida pelo inspetor");
      return;
    }
  }

  if (!isImage || !imageUrl) {
    log.info({ phone, textBody }, "mensagem não é imagem nem comando — ignorada");
    return;
  }

  if (caption) {
    await handleImageWithCaption(phone, caption, imageUrl);
  } else {
    await handleImageWithoutCaption(phone, imageUrl);
  }
}

async function getUnidadeContexto(phone: string): Promise<string | null> {
  const normalizado = normalizar(phone);
  const { data } = await supabaseAdmin
    .from("inspetores")
    .select("unidade_contexto")
    .eq("telefone_normalizado", normalizado)
    .maybeSingle();
  return (data as any)?.unidade_contexto ?? null;
}

async function handleImageWithCaption(
  phone: string,
  caption: string,
  imageUrl: string
): Promise<void> {
  const unidade_contexto = await getUnidadeContexto(phone);

  // Close any open batch for this phone first
  const { data: loteAberto } = await buscarLoteAberto<any>(
    phone,
    "id, legenda, fotos, phone, unidade_contexto, mes_referencia, data_inspecao"
  );

  if (loteAberto) {
    await supabase
      .from("lotes_fotos")
      .update({ status: "pronto" })
      .eq("id", loteAberto.id);

    log.info(
      { phone, loteId: loteAberto.id, extintor: loteAberto.legenda, qtdFotos: loteAberto.fotos.length },
      "lote anterior finalizado — nova legenda recebida"
    );

    triggerAnalise({ ...loteAberto, status: "pronto" });
  }

  // Open new batch
  const { data: novoLote, error } = await supabase
    .from("lotes_fotos")
    .insert({
      phone,
      legenda: caption,
      fotos: [imageUrl],
      status: "aberto",
      started_at: new Date().toISOString(),
      ...(unidade_contexto ? { unidade_contexto } : {}),
    })
    .select()
    .single();

  if (error) {
    log.error({ phone, caption, err: error.message }, "erro ao criar novo lote");
    return;
  }

  log.info(
    { phone, loteId: novoLote.id, extintor: caption, qtdFotos: 1 },
    "lote aberto — primeira foto recebida com legenda"
  );
  resetBatchTimer(phone);
}

async function handleFinalizarLote(phone: string): Promise<void> {
  const { data: loteAberto, error } = await buscarLoteAberto<any>(
    phone,
    "id, legenda, fotos, phone, unidade_contexto, mes_referencia, data_inspecao"
  );

  if (error) {
    log.error({ phone, err: error.message }, "erro ao buscar lote aberto para finalizar");
    return;
  }

  if (!loteAberto) {
    log.warn({ phone }, "comando 'fim' recebido mas nenhum lote aberto encontrado");
    return;
  }

  await supabase
    .from("lotes_fotos")
    .update({ status: "pronto" })
    .eq("id", loteAberto.id);

  log.info(
    { phone, loteId: loteAberto.id, extintor: loteAberto.legenda, qtdFotos: loteAberto.fotos.length },
    "lote finalizado por comando 'fim'"
  );

  triggerAnalise({ ...loteAberto, status: "pronto" });
}

function triggerAnalise(lote: LoteFotos): void {
  log.info({ loteId: lote.id, extintor: lote.legenda }, "disparando análise de IA em segundo plano");
  analisarLote(lote).catch((err: Error) =>
    log.error({ loteId: lote.id, err: err.message }, "erro na análise do lote")
  );
}

async function handleImageWithoutCaption(
  phone: string,
  imageUrl: string
): Promise<void> {
  const { data: loteAberto, error: fetchError } = await buscarLoteAberto<{
    id: string;
    legenda: string;
    fotos: string[];
  }>(phone, "id, legenda, fotos");

  if (fetchError) {
    log.error({ phone, err: fetchError.message }, "erro ao buscar lote aberto");
    return;
  }

  if (!loteAberto) {
    // No open batch — auto-open one with a placeholder name
    const unidade_contexto = await getUnidadeContexto(phone);
    const { data: novoLote, error: insertError } = await supabase
      .from("lotes_fotos")
      .insert({
        phone,
        legenda: "Extintor",
        fotos: [imageUrl],
        status: "aberto",
        started_at: new Date().toISOString(),
        ...(unidade_contexto ? { unidade_contexto } : {}),
      })
      .select()
      .single();

    if (insertError) {
      log.error({ phone, err: insertError.message }, "erro ao criar lote automático");
      return;
    }
    log.info({ phone, loteId: novoLote.id, qtdFotos: 1 }, "lote automático aberto — foto sem legenda");
    resetBatchTimer(phone);
    return;
  }

  const fotosAtualizadas = [...loteAberto.fotos, imageUrl];

  const { error: updateError } = await supabase
    .from("lotes_fotos")
    .update({ fotos: fotosAtualizadas })
    .eq("id", loteAberto.id);

  if (updateError) {
    log.error({ phone, loteId: loteAberto.id, err: updateError.message }, "erro ao adicionar foto ao lote");
    return;
  }

  log.info(
    { phone, loteId: loteAberto.id, extintor: loteAberto.legenda, qtdFotos: fotosAtualizadas.length },
    "lote atualizado — foto adicionada"
  );
  resetBatchTimer(phone);
}

export default router;
