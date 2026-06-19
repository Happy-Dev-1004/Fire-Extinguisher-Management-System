import { Router, Request, Response } from "express";
import { supabase } from "../db";
import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { normalizar, variantesTelefone } from "../inspetores/normalizar";
import { analisarLote, extrairNumeroTag, type LoteFotos } from "../analise/analisar";
import { resolverNomeRegiao } from "../regioes/regioes";
import { processarRdo } from "../rdo/maquina";
import { rdoDeps } from "../rdo/deps";

const router = Router();
const log = logger.child({ rota: "webhook" });

// Per-phone queue: ensures messages from the same inspector
// are processed one at a time, never in parallel.
const filas = new Map<string, Promise<void>>();

// Settle window: when the inspector sends the NUMBER, we don't finalise the
// batch immediately — album photos arrive as independent webhook calls and the
// number can land BEFORE the last photos. The number LABELS the batch and arms
// a short debounce timer; each photo that arrives resets it. When photos stop
// for BATCH_SETTLE_MS after the number, the batch finalises and is analysed.
// This groups the whole album correctly regardless of arrival order.
const BATCH_SETTLE_MS = 8_000;
const settleTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Long safety net for batches left open across a server restart / forgotten
// number (the in-memory settle timer doesn't survive a restart; the sweep
// finalises labeled batches whose window elapsed, and abandons very old ones).
const BATCH_ABANDONO_MS = 20 * 60 * 1000; // 20 min — well beyond any real album

function enqueueForPhone(phone: string, task: () => Promise<void>): void {
  const anterior = filas.get(phone) ?? Promise.resolve();
  const proxima = anterior.then(task).catch((err) =>
    log.error({ phone, err: err.message }, "erro na fila de processamento")
  );
  filas.set(phone, proxima);
}

// Arms (or re-arms) the settle timer for a phone. When it fires, the labeled
// batch is finalised and analysed — but only if no new photo reset it first.
function armarSettle(phone: string): void {
  const existing = settleTimers.get(phone);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    settleTimers.delete(phone);
    enqueueForPhone(phone, () => finalizarLoteRotulado(phone));
  }, BATCH_SETTLE_MS);
  settleTimers.set(phone, t);
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
  const variantes = variantesTelefone(phone);
  if (variantes.length === 0) return false;

  // Match ANY phone variant (with/without the 9th digit) so an inspector is
  // recognised regardless of how WhatsApp/Z-API formatted their number.
  const { data, error } = await supabaseAdmin
    .from("inspetores")
    .select("id")
    .in("telefone_normalizado", variantes)
    .eq("ativo", true)
    .limit(1);

  if (error) {
    log.error({ err: error.message }, "erro ao verificar autorização no banco");
    return false;
  }

  return (data?.length ?? 0) > 0;
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
  const variantes = variantesTelefone(phone);
  if (variantes.length === 0) return false;

  const { data } = await supabaseAdmin
    .from("inspetores")
    .select("em_sessao, sessao_atividade_em")
    .in("telefone_normalizado", variantes)
    .eq("ativo", true)
    .limit(1);

  const row = data?.[0] as any;
  if (!row || !row.em_sessao) return false;

  const ultima = row.sessao_atividade_em ? new Date(row.sessao_atividade_em).getTime() : 0;
  if (ultima && Date.now() - ultima > SESSAO_BACKSTOP_MS) {
    await definirSessao(phone, false);
    log.info({ phone }, "sessão encerrada automaticamente por inatividade (backstop 3h)");
    return false;
  }
  return true;
}

// Opens or closes the inspector's session and stamps the activity time.
async function definirSessao(phone: string, aberta: boolean): Promise<void> {
  const variantes = variantesTelefone(phone);
  if (variantes.length === 0) return;
  const agora = new Date().toISOString();
  await supabaseAdmin
    .from("inspetores")
    .update({
      em_sessao: aberta,
      ...(aberta ? { sessao_iniciada_em: agora } : {}),
      sessao_atividade_em: agora,
    })
    .in("telefone_normalizado", variantes);
}

// Bumps the activity timestamp (called on each processed message) so the
// backstop only fires after real inactivity.
async function tocarSessao(phone: string): Promise<void> {
  const variantes = variantesTelefone(phone);
  if (variantes.length === 0) return;
  await supabaseAdmin
    .from("inspetores")
    .update({ sessao_atividade_em: new Date().toISOString() })
    .in("telefone_normalizado", variantes);
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

  // ── RDO (Relatório Diário de Obra) guided flow ─────────────────────────────
  // If the supervisor has an active RDO session OR sends the "RDO" trigger, the
  // RDO engine handles this message (asks the next question / stores the answer
  // / collects photos). It returns true when it consumed the message, so we stop
  // before the extinguisher logic. Sessions are keyed by normalized phone, so
  // the extinguisher flow and RDO never collide.
  const messageId: string | null =
    body?.messageId ?? body?.message?.messageId ?? body?.id ?? null;
  const telNorm = (() => { try { return normalizar(phone); } catch { return null; } })();
  if (telNorm) {
    const consumido = await processarRdo(rdoDeps, {
      telefone_normalizado: telNorm,
      telefone_envio: phone,   // raw phone (with country code) for Z-API replies
      messageId,
      texto: rawTextBody ?? null,
      imageUrl: isImage ? (imageUrl ?? null) : null,
    });
    if (consumido) return;
  }

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
        .in("telefone_normalizado", variantesTelefone(phone));
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
        .in("telefone_normalizado", variantesTelefone(phone));
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
      const rotulado = await rotularEArmar(phone, numeroTag);
      if (rotulado) log.info({ phone, numero: numeroTag }, "número recebido — lote rotulado (janela de assentamento)");
      else          log.warn({ phone, numero: numeroTag }, "número recebido mas nenhum lote aberto — ignorado");
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
  const variantes = variantesTelefone(phone);
  if (variantes.length === 0) return null;
  const { data } = await supabaseAdmin
    .from("inspetores")
    .select("unidade_contexto, regiao_contexto")
    .in("telefone_normalizado", variantes)
    .limit(1);
  const row = data?.[0] as any;
  // Prefer the region context (the new model); fall back to legacy unidade.
  return row?.regiao_contexto ?? row?.unidade_contexto ?? null;
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
    rotulado_em: string | null;
  }>(phone, "id, legenda, fotos, rotulado_em");

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

  // If this photo is a straggler arriving AFTER the number labeled the batch,
  // re-arm the settle window so it (and any further stragglers) still get
  // grouped before analysis fires.
  if (loteAberto.rotulado_em) {
    log.info({ phone, loteId: loteAberto.id }, "foto tardia em lote rotulado — reiniciando janela de assentamento");
    armarSettle(phone);
  }
}

// Labels the current open batch with the number and ARMS the settle timer —
// it does NOT finalise yet. Straggler album photos that arrive within the settle
// window still join the batch (and re-arm the timer). Returns false if no open
// batch. The actual finalisation happens in finalizarLoteRotulado().
async function rotularEArmar(phone: string, numero: string): Promise<boolean> {
  const { data: lote } = await buscarLoteAberto<any>(phone, "id, fotos");
  if (!lote) return false;

  await supabase
    .from("lotes_fotos")
    .update({ legenda: numero, numero, rotulado_em: new Date().toISOString() })
    .eq("id", lote.id);

  log.info({ phone, loteId: lote.id, numero, qtdFotos: lote.fotos.length },
    "lote rotulado com número — aguardando janela de assentamento");
  armarSettle(phone);
  return true;
}

// Finalises the labeled (rotulado) open batch for a phone: flips it to 'pronto'
// and triggers analysis. Called when the settle window elapses with no new
// photos, or by the sweep as a restart backstop. No-op if there's no labeled
// open batch (e.g. a stray photo re-opened it and a new number is coming).
async function finalizarLoteRotulado(phone: string): Promise<void> {
  const { data: lote } = await buscarLoteAberto<any>(
    phone,
    "id, legenda, numero, fotos, phone, unidade_contexto, rotulado_em"
  );
  if (!lote || !lote.rotulado_em) return; // not labeled → nothing to finalise

  const numero = lote.numero ?? lote.legenda;
  await supabase.from("lotes_fotos").update({ status: "pronto", legenda: numero }).eq("id", lote.id);
  log.info({ phone, loteId: lote.id, numero, qtdFotos: lote.fotos.length },
    "janela de assentamento concluída — lote finalizado para análise");
  triggerAnalise({ ...lote, legenda: numero, status: "pronto" });
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
    .select("id, phone, legenda, numero, fotos, status, started_at, created_at, unidade_contexto, rotulado_em")
    .eq("status", "aberto");

  if (error) {
    log.error({ err: error.message }, "varredura: falha ao buscar lotes abandonados");
    return;
  }

  const settleLimite = new Date(Date.now() - BATCH_SETTLE_MS).toISOString();

  const paraFechar = (lotes ?? []).filter((l: any) => {
    // (a) Labeled batch whose settle window elapsed (e.g. timer lost to a
    //     restart): finalise it. (b) Any batch abandoned far too long.
    if (l.rotulado_em && new Date(l.rotulado_em).toISOString() < settleLimite) return true;
    const ts = l.started_at ?? l.created_at;
    if (!ts) return true;
    return new Date(ts).toISOString() < limite;
  });

  if (paraFechar.length === 0) return;
  log.info({ qtd: paraFechar.length }, "varredura: lotes para finalizar (assentados ou abandonados)");

  for (const lote of paraFechar) {
    const numero = lote.numero ?? lote.legenda;
    const { error: lockErr } = await supabase
      .from("lotes_fotos")
      .update({ status: "pronto", legenda: numero })
      .eq("id", lote.id)
      .eq("status", "aberto");

    if (lockErr) {
      log.error({ loteId: lote.id, err: lockErr.message }, "varredura: falha ao fechar lote");
      continue;
    }
    log.info({ loteId: lote.id, extintor: numero }, "varredura: lote fechado — disparando análise");
    triggerAnalise({ ...lote, legenda: numero, status: "pronto" });
  }
}

export default router;
