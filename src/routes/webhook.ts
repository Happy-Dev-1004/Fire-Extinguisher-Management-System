import { Router, Request, Response } from "express";
import { supabase } from "../db";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { normalizar } from "../inspetores/normalizar";
import { analisarLote, extrairNumeroTag, type LoteFotos } from "../analise/analisar";
import { resolverNomeRegiao } from "../regioes/regioes";

const router = Router();
const log = logger.child({ rota: "webhook" });

// Per-phone queue: ensures messages from the same inspector
// are processed one at a time, never in parallel.
const filas = new Map<string, Promise<void>>();

// Batches no longer auto-close on a short inactivity timer — that splits albums
// when photos arrive slowly. They close ONLY when the inspector sends the number
// (rotularEFecharLote) or "Encerrar". The sweep below is just a long safety net
// for batches left open across a server restart / forgotten number.
const BATCH_ABANDONO_MS = 20 * 60 * 1000; // 20 min — well beyond any real album

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

// ── Work-session gate (token saving) ──────────────────────────────────────────
// A registered inspector's photos are only analysed while a session is OPEN.
// "Iniciar" opens it; "Encerrar" closes it; photos sent outside a session are
// ignored (no OpenAI call). A 3h inactivity backstop closes forgotten sessions.
const SESSAO_BACKSTOP_MS = 3 * 60 * 60 * 1000; // 3 hours

// Returns true if the inspector currently has an OPEN session. Applies the
// inactivity backstop: if the last activity is older than 3h, the session is
// auto-closed here and treated as closed.
async function emSessao(phone: string): Promise<boolean> {
  let normalizado: string;
  try { normalizado = normalizar(phone); } catch { return false; }

  const { data } = await supabaseAdmin
    .from("inspetores")
    .select("em_sessao, sessao_atividade_em")
    .eq("telefone_normalizado", normalizado)
    .eq("ativo", true)
    .maybeSingle();

  if (!data || !(data as any).em_sessao) return false;

  const ultima = (data as any).sessao_atividade_em ? new Date((data as any).sessao_atividade_em).getTime() : 0;
  if (ultima && Date.now() - ultima > SESSAO_BACKSTOP_MS) {
    await definirSessao(phone, false);
    log.info({ phone }, "sessão encerrada automaticamente por inatividade (backstop 3h)");
    return false;
  }
  return true;
}

// Opens or closes the inspector's session and stamps the activity time.
async function definirSessao(phone: string, aberta: boolean): Promise<void> {
  let normalizado: string;
  try { normalizado = normalizar(phone); } catch { return; }
  const agora = new Date().toISOString();
  await supabaseAdmin
    .from("inspetores")
    .update({
      em_sessao: aberta,
      ...(aberta ? { sessao_iniciada_em: agora } : {}),
      sessao_atividade_em: agora,
    })
    .eq("telefone_normalizado", normalizado);
}

// Bumps the activity timestamp (called on each processed message) so the
// backstop only fires after real inactivity.
async function tocarSessao(phone: string): Promise<void> {
  let normalizado: string;
  try { normalizado = normalizar(phone); } catch { return; }
  await supabaseAdmin
    .from("inspetores")
    .update({ sessao_atividade_em: new Date().toISOString() })
    .eq("telefone_normalizado", normalizado);
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

  const rawTextBody: string | undefined = (
    body?.text?.message ??
    body?.message?.conversation ??
    body?.message?.extendedTextMessage?.text
  )?.trim();
  const textBody: string | undefined = rawTextBody?.toLowerCase();

  if (!phone || !(await isAuthorized(phone))) {
    log.warn({ phone: phone ?? "desconhecido" }, "número não autorizado — mensagem ignorada");
    return;
  }

  log.info({ phone }, "inspetor autorizado");

  // ── Session commands (token gate) ──────────────────────────────────────────
  // "Iniciar" OPENS a work session → photos start being processed.
  // "Encerrar" CLOSES it → photos are ignored until the next "Iniciar".
  const INICIADORES = ["iniciar", "início", "inicio", "começar", "comecar", "iniciar tarefa", "iniciar inspeção", "iniciar inspecao", "start"];
  const ENCERRADORES = ["encerrar", "encerrar tarefa", "finalizar sessão", "finalizar sessao", "encerrar inspeção", "encerrar inspecao", "parar"];

  if (isText && textBody && INICIADORES.includes(textBody)) {
    await definirSessao(phone, true);
    log.info({ phone }, "sessão de trabalho ABERTA pelo inspetor (Iniciar)");
    return;
  }
  if (isText && textBody && ENCERRADORES.includes(textBody)) {
    // Close any open photo batch first, then close the session.
    await handleFinalizarLote(phone);
    await definirSessao(phone, false);
    log.info({ phone }, "sessão de trabalho ENCERRADA pelo inspetor (Encerrar)");
    return;
  }

  // "Fim" closes the CURRENT extinguisher batch (triggers analysis) but keeps
  // the session open — the inspector continues to the next extinguisher.
  const FINALIZADORES = ["fim", "ok", "pronto", "finalizar", "concluir", "done"];
  if (isText && textBody && FINALIZADORES.includes(textBody)) {
    await tocarSessao(phone);
    await handleFinalizarLote(phone);
    return;
  }

  // Region context. The inspector sends the region name BEFORE the photos —
  // either as a bare region name ("Barry Itabuna") or "regiao: Barry Itabuna".
  // We match it against the known regions (accent/case-insensitive) and store it
  // as the active context for this inspector's session.
  if (isText && rawTextBody) {
    const semPrefixo = rawTextBody.replace(/^regi[aã]o\s*[:\-]\s*/i, "").trim();
    const regiao = await resolverNomeRegiao(semPrefixo);
    if (regiao) {
      await supabaseAdmin
        .from("inspetores")
        .update({ regiao_contexto: regiao, unidade_contexto: regiao })
        .eq("telefone_normalizado", normalizar(phone));
      log.info({ phone, regiao }, "região de contexto definida pelo inspetor");
      return;
    }
    // Legacy "unidade: X" still supported for free-text units.
    const matchUnidade = rawTextBody.match(/^unidade\s*[:\-]\s*(.+)/i);
    if (matchUnidade) {
      const nomeUnidade = matchUnidade[1].trim();
      await supabaseAdmin
        .from("inspetores")
        .update({ unidade_contexto: nomeUnidade })
        .eq("telefone_normalizado", normalizar(phone));
      log.info({ phone, unidade: nomeUnidade }, "unidade de contexto definida pelo inspetor");
      return;
    }

    // ── Album number ─────────────────────────────────────────────────────────
    // Album workflow: the inspector sends the photos of one extinguisher (an
    // album, all uncaptioned), then sends the NUMBER as its own text message
    // ("18"). That number LABELS and CLOSES the open batch → triggers analysis.
    // This is the boundary between extinguishers — no "Fim" needed.
    const numeroTag = extrairNumeroTag(rawTextBody);
    if (numeroTag && (await emSessao(phone))) {
      await tocarSessao(phone);
      const fechado = await rotularEFecharLote(phone, numeroTag);
      if (fechado) log.info({ phone, numero: numeroTag }, "número recebido — lote rotulado e fechado para análise");
      else         log.warn({ phone, numero: numeroTag }, "número recebido mas nenhum lote aberto — ignorado");
      return;
    }
  }

  if (!isImage || !imageUrl) {
    log.info({ phone, textBody }, "mensagem não é imagem nem comando — ignorada");
    return;
  }

  // ── Token gate ─────────────────────────────────────────────────────────────
  // Only process photos while the inspector has an OPEN session. Outside a
  // session the photo is ignored silently — NO OpenAI call, no token cost.
  if (!(await emSessao(phone))) {
    log.info({ phone }, "foto recebida fora de sessão — ignorada (sem custo de IA). Envie 'Iniciar' para começar.");
    return;
  }
  await tocarSessao(phone);

  // Album model: photos arrive uncaptioned and ACCUMULATE in the current open
  // batch until the inspector sends the number. No inactivity timer is used —
  // batches close on a number text or on "Encerrar", never on a timeout, so a
  // slow album is never split. A legacy captioned photo still opens a fresh batch.
  if (caption) {
    await handleImageWithCaption(phone, caption, imageUrl);
  } else {
    await handleImageSemLegenda(phone, imageUrl);
  }
}

async function getUnidadeContexto(phone: string): Promise<string | null> {
  const normalizado = normalizar(phone);
  const { data } = await supabaseAdmin
    .from("inspetores")
    .select("unidade_contexto, regiao_contexto")
    .eq("telefone_normalizado", normalizado)
    .maybeSingle();
  // Prefer the region context (the new model); fall back to legacy unidade.
  return (data as any)?.regiao_contexto ?? (data as any)?.unidade_contexto ?? null;
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

// An uncaptioned photo (the album case). It ACCUMULATES into the current open
// batch. If no batch is open yet, it opens one named "Extintor" — which stays
// open (no timer) until the inspector sends the extinguisher number, which
// labels and closes it. So an album of N photos all land in the same batch.
async function handleImageSemLegenda(
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
    // First photo of an extinguisher with no open batch — open one (no timer).
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
    log.info({ phone, loteId: novoLote.id, qtdFotos: 1 }, "lote aberto — primeira foto do álbum (aguardando número)");
    return;
  }

  // Atomic append via append_foto_lote() — concurrent album photos can't clobber.
  const { data: atualizado, error: rpcError } = await supabase.rpc("append_foto_lote", {
    p_phone: phone,
    p_foto:  imageUrl,
  });

  if (rpcError) {
    log.warn({ phone, err: rpcError.message }, "rpc append_foto_lote indisponível — usando fallback read-modify-write");
    const { data: fresco } = await buscarLoteAberto<{ id: string; fotos: string[] }>(phone, "id, fotos");
    if (fresco) {
      await supabase
        .from("lotes_fotos")
        .update({ fotos: [...(fresco.fotos ?? []), imageUrl] })
        .eq("id", fresco.id);
    }
    return;
  }

  const row = Array.isArray(atualizado) ? atualizado[0] : atualizado;
  const qtd = row?.fotos?.length ?? (loteAberto.fotos.length + 1);
  log.info(
    { phone, loteId: loteAberto.id, extintor: loteAberto.legenda, qtdFotos: qtd },
    "foto do álbum adicionada ao lote (atômico)"
  );
}

// Labels the current open batch with the given number and closes it, triggering
// analysis. This is how an album is finalised: photos accumulate, then the number
// text closes the batch with that number. Returns false if no batch was open.
async function rotularEFecharLote(phone: string, numero: string): Promise<boolean> {
  const { data: lote } = await buscarLoteAberto<any>(
    phone,
    "id, legenda, fotos, phone, unidade_contexto"
  );
  if (!lote) return false;

  await supabase
    .from("lotes_fotos")
    .update({ status: "pronto", legenda: numero })
    .eq("id", lote.id);

  log.info(
    { phone, loteId: lote.id, numero, qtdFotos: lote.fotos.length },
    "lote rotulado com número e finalizado"
  );
  triggerAnalise({ ...lote, legenda: numero, status: "pronto" });
  return true;
}

// Safety net: recovers batches left 'aberto' far too long (forgotten number, or
// a redeploy mid-batch). Closes any batch older than BATCH_ABANDONO_MS (20 min)
// and analyses it with whatever number it has. Safe to run repeatedly: each
// batch is flipped 'aberto' -> 'pronto' before analysis, and analisarLote only
// acts on 'pronto', so concurrent sweeps can't double-process. The long window
// ensures it never closes a batch that's still receiving an album's photos.
export async function varrerLotesAbandonados(): Promise<void> {
  const limite = new Date(Date.now() - BATCH_ABANDONO_MS).toISOString();

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
