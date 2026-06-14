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
    "id, legenda, fotos, phone, unidade_contexto"
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
      temImagem: !!(body?.image ?? body?.message?.imageMessage ?? body?.document ?? body?.message?.documentMessage),
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

  // Inspectors often send photos as FILE attachments (WhatsApp "document"),
  // not inline photos. Z-API then delivers a `document`/documentMessage with a
  // mimetype like "image/jpeg" instead of an imageMessage. Treat any document
  // whose mimetype is an image (jpg/jpeg/png/webp) exactly like a photo, so
  // both sending styles work.
  const docMime: string | undefined =
    body?.document?.mimeType ??
    body?.document?.mimetype ??
    body?.message?.documentMessage?.mimetype;
  const docUrl: string | undefined =
    body?.document?.documentUrl ??
    body?.document?.url ??
    body?.message?.documentMessage?.url;
  const isImageDocument: boolean =
    isReceivedCallback &&
    !!docUrl &&
    (/(image\/(jpe?g|png|webp))/i.test(docMime ?? "") ||
     // some payloads omit mimetype but include a .jpg/.png filename/url
     /\.(jpe?g|png|webp)(\?|$)/i.test(
       (body?.document?.fileName ?? body?.message?.documentMessage?.fileName ?? docUrl) as string
     ));

  const isImage: boolean =
    isReceivedCallback &&
    (body?.image != null || body?.message?.imageMessage != null || isImageDocument);

  const imageUrl: string | undefined =
    body?.image?.imageUrl ??
    body?.image?.url ??
    body?.message?.imageMessage?.url ??
    (isImageDocument ? docUrl : undefined);

  const rawCaption: string | undefined =
    body?.image?.caption ??
    body?.message?.imageMessage?.caption ??
    body?.document?.caption ??
    body?.message?.documentMessage?.caption ??
    body?.document?.fileName ??
    body?.message?.documentMessage?.fileName;
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
    "id, legenda, fotos, phone, unidade_contexto"
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
    "id, legenda, fotos, phone, unidade_contexto"
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

  // Atomic append via the append_foto_lote() RPC. The previous read-modify-write
  // ([...loteAberto.fotos, imageUrl] then UPDATE) lost photos when an inspector
  // sent several at once: two handlers read the same array and overwrote each
  // other (4 sent, 2 stored). The RPC appends in a single locked statement, so
  // concurrent photos can never clobber one another.
  const { data: atualizado, error: rpcError } = await supabase.rpc("append_foto_lote", {
    p_phone: phone,
    p_foto:  imageUrl,
  });

  if (rpcError) {
    // Fallback for before migration 0010 is applied (RPC not yet created):
    // fetch the freshest array and append. Less safe under heavy concurrency,
    // but keeps photos flowing until the atomic RPC exists.
    log.warn({ phone, err: rpcError.message }, "rpc append_foto_lote indisponível — usando fallback read-modify-write");
    const { data: fresco } = await buscarLoteAberto<{ id: string; fotos: string[] }>(phone, "id, fotos");
    if (fresco) {
      await supabase
        .from("lotes_fotos")
        .update({ fotos: [...(fresco.fotos ?? []), imageUrl] })
        .eq("id", fresco.id);
    }
    resetBatchTimer(phone);
    return;
  }

  const row = Array.isArray(atualizado) ? atualizado[0] : atualizado;
  const qtd = row?.fotos?.length ?? (loteAberto.fotos.length + 1);

  log.info(
    { phone, loteId: loteAberto.id, extintor: loteAberto.legenda, qtdFotos: qtd },
    "lote atualizado — foto adicionada (atômico)"
  );
  resetBatchTimer(phone);
}

// Recovers batches left 'aberto' when the in-memory auto-close timer was lost
// (e.g. a redeploy restarted the server mid-batch). Closes any batch idle longer
// than BATCH_TIMEOUT_MS and triggers its analysis. Safe to run repeatedly:
// each batch is flipped 'aberto' -> 'pronto' before analysis, and analisarLote
// only acts on 'pronto', so concurrent sweeps can't double-process.
export async function varrerLotesAbandonados(): Promise<void> {
  const limite = new Date(Date.now() - BATCH_TIMEOUT_MS).toISOString();

  // Select ALL open batches, then filter by age in JS. Filtering by
  // started_at in the query (.lt) silently drops rows where started_at is
  // NULL — which is exactly the case for batches created before that column
  // was reliably set, leaving them stuck 'aberto' forever. A NULL started_at
  // is treated as "old enough" so those legacy batches get recovered too.
  // Only columns that exist on lotes_fotos. mes_referencia / data_inspecao are
  // NOT columns here — analisarLote derives them (resolverMesAtual / hoje) when
  // absent, so we must not request them or the query errors out entirely.
  const { data: lotes, error } = await supabase
    .from("lotes_fotos")
    .select("id, phone, legenda, fotos, status, started_at, created_at, unidade_contexto")
    .eq("status", "aberto");

  if (error) {
    log.error({ err: error.message }, "varredura: falha ao buscar lotes abandonados");
    return;
  }

  const abandonados = (lotes ?? []).filter((l: any) => {
    const ts = l.started_at ?? l.created_at;
    if (!ts) return true; // no timestamp at all → treat as abandoned
    return new Date(ts).toISOString() < limite;
  });

  if (abandonados.length === 0) return;
  const lotesParaFechar = abandonados;

  log.info({ qtd: lotesParaFechar.length }, "varredura: lotes abandonados encontrados — fechando e analisando");

  for (const lote of lotesParaFechar) {
    const { error: lockErr } = await supabase
      .from("lotes_fotos")
      .update({ status: "pronto" })
      .eq("id", lote.id)
      .eq("status", "aberto");

    if (lockErr) {
      log.error({ loteId: lote.id, err: lockErr.message }, "varredura: falha ao fechar lote");
      continue;
    }
    log.info({ loteId: lote.id, extintor: lote.legenda }, "varredura: lote fechado — disparando análise");
    triggerAnalise({ ...lote, status: "pronto" });
  }
}

export default router;
