// RDO conversation state machine (the engine).
//
// Drives the guided WhatsApp capture: starts a session, asks PERGUNTAS in order,
// validates + stores each answer, supports "voltar"/"cancelar", collects the
// day's photos, then finalises the RDO and sends a pt-BR summary.
//
// All side effects (DB, sending WhatsApp, uploading photos, the clock) are
// injected via `Deps`, so the engine is fully unit-testable with mocks and has
// no hidden globals. The webhook supplies the real implementations.

import { PERGUNTAS, type Pergunta } from "./perguntas";
import { validarResposta } from "./validacao";

export interface Sessao {
  telefone_normalizado: string;
  rdo_id: string;
  etapa: number;
  ultima_msg_id: string | null;
  aguardando_fotos: boolean;
}

export interface Deps {
  // session store
  getSessao(tel: string): Promise<Sessao | null>;
  criarSessao(tel: string, rdoId: string): Promise<Sessao>;
  atualizarSessao(tel: string, patch: Partial<Sessao>): Promise<void>;
  apagarSessao(tel: string): Promise<void>;
  // rdo store
  criarRdo(telefoneOrigem: string): Promise<string>;            // returns rdo id
  setCampoRdo(rdoId: string, destino: Pergunta["destino"], valor: unknown): Promise<void>;
  anexarFotoRdo(rdoId: string, url: string): Promise<void>;
  finalizarRdo(rdoId: string): Promise<any>;                    // returns the row
  cancelarRdo(rdoId: string): Promise<void>;
  // io
  enviar(tel: string, texto: string): Promise<void>;
  subirFoto(rdoId: string, imageUrl: string, suffix: string): Promise<string | null>;
  hojeISO(): string;
}

export interface Entrada {
  telefone_normalizado: string;
  messageId?: string | null;
  texto?: string | null;       // text message (already trimmed)
  imageUrl?: string | null;    // a photo URL, if this message is an image
}

const GATILHOS = ["rdo", "iniciar relatório", "iniciar relatorio", "novo rdo", "relatório diário", "relatorio diario"];
const CANCELAR = ["cancelar", "cancela", "abortar"];
const VOLTAR   = ["voltar", "volta"];
const PRONTO   = ["pronto", "ok", "concluir", "finalizar", "fim"];

export function ehGatilhoRdo(texto: string | null | undefined): boolean {
  return !!texto && GATILHOS.includes(texto.trim().toLowerCase());
}

function pergunta(etapa: number): Pergunta | undefined {
  return PERGUNTAS[etapa];
}

// Sends the question for the current etapa (or the photo prompt).
async function perguntar(deps: Deps, tel: string, etapa: number): Promise<void> {
  const p = pergunta(etapa);
  if (!p) return;
  await deps.enviar(tel, p.pergunta);
}

// Returns true if this message was handled by the RDO engine (so the webhook
// stops). Returns false if there's no active session and it isn't a trigger —
// the webhook then continues to its normal (extinguisher) handling.
export async function processarRdo(deps: Deps, e: Entrada): Promise<boolean> {
  const tel = e.telefone_normalizado;
  const texto = (e.texto ?? "").trim();
  const lower = texto.toLowerCase();

  const sessao = await deps.getSessao(tel);

  // ── No active session ──────────────────────────────────────────────────────
  if (!sessao) {
    if (ehGatilhoRdo(texto)) {
      const rdoId = await deps.criarRdo(tel);
      await deps.criarSessao(tel, rdoId);
      await deps.enviar(tel,
        "✅ RDO iniciado! Vou te fazer algumas perguntas, uma de cada vez.\n" +
        "A qualquer momento: *voltar* para corrigir a anterior, ou *cancelar* para abortar.");
      await perguntar(deps, tel, 0);
      return true;
    }
    return false; // not ours — let the webhook handle it
  }

  // ── Active session: idempotency guard ──────────────────────────────────────
  // A duplicate Z-API delivery (same messageId) must not double-advance.
  if (e.messageId && sessao.ultima_msg_id && e.messageId === sessao.ultima_msg_id) {
    return true; // already processed this exact message
  }

  // ── Global commands ────────────────────────────────────────────────────────
  if (CANCELAR.includes(lower)) {
    await deps.cancelarRdo(sessao.rdo_id);
    await deps.apagarSessao(tel);
    await deps.enviar(tel, "❌ RDO cancelado. Envie *RDO* quando quiser começar de novo.");
    return true;
  }
  if (VOLTAR.includes(lower) && !sessao.aguardando_fotos) {
    const novaEtapa = Math.max(0, sessao.etapa - 1);
    await deps.atualizarSessao(tel, { etapa: novaEtapa, ultima_msg_id: e.messageId ?? null, aguardando_fotos: false });
    await deps.enviar(tel, "↩️ Voltando à pergunta anterior.");
    await perguntar(deps, tel, novaEtapa);
    return true;
  }

  const p = pergunta(sessao.etapa);
  if (!p) {
    // Out of range → finalise defensively.
    await finalizar(deps, tel, sessao.rdo_id);
    return true;
  }

  // ── Photo step ─────────────────────────────────────────────────────────────
  if (p.tipo === "fotos") {
    // Mark we're awaiting photos (so the next photos attach here).
    if (!sessao.aguardando_fotos) {
      await deps.atualizarSessao(tel, { aguardando_fotos: true, ultima_msg_id: e.messageId ?? null });
    }
    if (e.imageUrl) {
      const url = await deps.subirFoto(sessao.rdo_id, e.imageUrl, `${Date.now()}-${Math.floor(0)}`);
      if (url) await deps.anexarFotoRdo(sessao.rdo_id, url);
      await deps.atualizarSessao(tel, { ultima_msg_id: e.messageId ?? null });
      await deps.enviar(tel, "📷 Foto recebida. Envie mais ou escreva *pronto* para concluir.");
      return true;
    }
    if (PRONTO.includes(lower) || (p.obrigatoria === false && lower === "pular")) {
      await finalizar(deps, tel, sessao.rdo_id);
      return true;
    }
    await deps.enviar(tel, "Envie as *fotos* do dia, ou escreva *pronto* para concluir.");
    await deps.atualizarSessao(tel, { ultima_msg_id: e.messageId ?? null });
    return true;
  }

  // ── A normal question awaiting a text answer ───────────────────────────────
  if (!texto) {
    // e.g. a photo arrived during a non-photo step — re-ask.
    await deps.enviar(tel, "Por favor, responda à pergunta com uma mensagem de texto.");
    return true;
  }

  const v = validarResposta(p, texto);
  if (!v.ok) {
    await deps.enviar(tel, `⚠️ ${v.erro}`);
    // do NOT advance; record we saw this message so a dup doesn't re-trigger
    await deps.atualizarSessao(tel, { ultima_msg_id: e.messageId ?? null });
    return true;
  }

  // resolve the "hoje" sentinel for dates using the injected clock
  let valor = v.valor;
  if (p.tipo === "data" && valor === "HOJE") valor = deps.hojeISO();

  await deps.setCampoRdo(sessao.rdo_id, p.destino, valor);

  const proxima = sessao.etapa + 1;
  if (proxima >= PERGUNTAS.length) {
    await finalizar(deps, tel, sessao.rdo_id);
    return true;
  }
  await deps.atualizarSessao(tel, { etapa: proxima, ultima_msg_id: e.messageId ?? null, aguardando_fotos: false });
  await perguntar(deps, tel, proxima);
  return true;
}

async function finalizar(deps: Deps, tel: string, rdoId: string): Promise<void> {
  const row = await deps.finalizarRdo(rdoId);
  await deps.apagarSessao(tel);
  await deps.enviar(tel, montarResumo(row));
}

export function montarResumo(rdo: any): string {
  const ef = rdo?.efetivo ?? {};
  const di = rdo?.dispositivos_instalados ?? {};
  const totalEfetivo = Object.values(ef).reduce((s: number, n: any) => s + (Number(n) || 0), 0);
  const totalDisp    = Object.values(di).reduce((s: number, n: any) => s + (Number(n) || 0), 0);
  const dataBR = rdo?.data ? formatarDataBR(rdo.data) : "—";
  return (
    "✅ *RDO concluído e registrado!*\n\n" +
    `📅 Data: ${dataBR}\n` +
    `👤 Responsável: ${rdo?.responsavel ?? "—"}\n` +
    `🏭 Central/Frente: ${rdo?.central ?? "—"}${rdo?.frente_trabalho ? " / " + rdo.frente_trabalho : ""}\n` +
    `👷 Efetivo total: ${totalEfetivo}\n` +
    `🧯 Dispositivos instalados hoje: ${totalDisp}\n` +
    `📷 Fotos anexadas: ${(rdo?.fotos_dia?.length ?? 0)}\n\n` +
    "Obrigado! O relatório foi salvo no sistema."
  );
}

function formatarDataBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
