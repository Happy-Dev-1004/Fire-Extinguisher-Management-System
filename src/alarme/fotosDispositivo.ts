// Device-photo WhatsApp flow engine (Phase 2 photographic record).
//
// Conversation shape, mirroring the album/RDO patterns already in this codebase:
//
//   supervisor: "dispositivo"                      → enters device-photo mode
//   supervisor: "Torrefacao sirene"  (or "L1.05")  → names the current device
//   supervisor: <photo> <photo> <photo>            → each attaches to that device
//   supervisor: "encerrar dispositivo"             → leaves the mode
//
// On a photo:
//   - if a device is currently named → store the photo to dispositivos_alarme.fotos[]
//     and mark status_instalacao='instalado' (+ data_instalacao if empty).
//   - if NO device is named, or the last identifier matched nothing → the photo is
//     NEVER lost: it goes to dispositivo_fotos_pendentes for human review.
//
// All side effects are injected via Deps so the engine is unit-testable.

import {
  resolverDispositivo,
  rotuloCandidato,
  type DispositivoCandidato,
} from "./fotosMatcher";

export interface SessaoFoto {
  telefone_normalizado: string;
  dispositivo_id: string | null;     // currently-named device (null until named)
  central_numero: number | null;     // context central, if known
  ultimo_identificador: string | null;
  ultima_msg_id: string | null;
}

export interface Deps {
  // session store
  getSessaoFoto(tel: string): Promise<SessaoFoto | null>;
  abrirSessaoFoto(tel: string, centralNumero: number | null): Promise<SessaoFoto>;
  atualizarSessaoFoto(tel: string, patch: Partial<SessaoFoto>): Promise<void>;
  apagarSessaoFoto(tel: string): Promise<void>;
  // device store
  listarCandidatos(centralNumero: number | null): Promise<DispositivoCandidato[]>;
  anexarFotoDispositivo(dispositivoId: string, url: string): Promise<{ total: number }>;
  // orphan store (never lose a photo)
  registrarFotoPendente(input: {
    identificador: string | null;
    central_numero: number | null;
    foto_url: string;
    motivo: string;
    telefone_origem: string | null;
  }): Promise<void>;
  // io
  enviar(tel: string, texto: string): Promise<void>;
  subirFoto(dispositivoIdOuPrefixo: string, imageUrl: string, suffix: string): Promise<string | null>;
  hojeISO(): string;
}

export interface Entrada {
  telefone_normalizado: string;
  telefone_envio?: string;     // raw phone for Z-API replies (defaults to normalized)
  telefone_origem?: string;    // raw phone stored on orphan rows
  messageId?: string | null;
  texto?: string | null;
  imageUrl?: string | null;
  // optional central context the webhook already resolved for this supervisor
  central_numero?: number | null;
}

const GATILHOS = [
  "dispositivo", "dispositivos", "foto dispositivo", "fotos dispositivo",
  "registrar dispositivo", "fotografar dispositivo",
];
const ENCERRAR = [
  "encerrar dispositivo", "encerrar dispositivos", "sair dispositivo",
  "fim dispositivo", "encerrar foto dispositivo",
];

export function ehGatilhoDispositivo(texto: string | null | undefined): boolean {
  return !!texto && GATILHOS.includes(texto.trim().toLowerCase());
}

// Increasing counter via messageId/suffix avoids Date.now()/Math.random (kept
// out so the engine is deterministic in tests). The webhook passes a unique
// suffix; tests pass the messageId.
function suffixFoto(e: Entrada): string {
  return (e.messageId ?? "foto").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "foto";
}

// Returns true if the message was consumed by the device-photo engine.
export async function processarFotoDispositivo(deps: Deps, e: Entrada): Promise<boolean> {
  const tel = e.telefone_normalizado;
  const envio = e.telefone_envio ?? tel;
  const origem = e.telefone_origem ?? envio;
  const texto = (e.texto ?? "").trim();
  const lower = texto.toLowerCase();

  let sessao = await deps.getSessaoFoto(tel);

  // ── Not in device-photo mode ────────────────────────────────────────────────
  if (!sessao) {
    if (ehGatilhoDispositivo(texto)) {
      sessao = await deps.abrirSessaoFoto(tel, e.central_numero ?? null);
      await deps.enviar(
        envio,
        "📸 *Modo registro de dispositivo* ativado.\n" +
          "Envie o *identificador* do dispositivo (ex.: `L1.05` ou `Torrefação sirene`) " +
          "e em seguida as *fotos* dele.\n" +
          "Quando terminar, escreva *encerrar dispositivo*."
      );
      return true;
    }
    return false; // not ours
  }

  // ── In device-photo mode ────────────────────────────────────────────────────
  // Idempotency: a duplicate Z-API delivery must not double-attach a photo.
  if (e.messageId && sessao.ultima_msg_id && e.messageId === sessao.ultima_msg_id) {
    return true;
  }

  if (ENCERRAR.includes(lower)) {
    await deps.apagarSessaoFoto(tel);
    await deps.enviar(envio, "✅ Modo registro de dispositivo encerrado.");
    return true;
  }

  // ── A photo ─────────────────────────────────────────────────────────────────
  if (e.imageUrl) {
    // No device named yet → store as pending (review), never drop it.
    if (!sessao.dispositivo_id) {
      const url = await deps.subirFoto("dispositivo-pendente", e.imageUrl, suffixFoto(e));
      if (url) {
        await deps.registrarFotoPendente({
          identificador: sessao.ultimo_identificador,
          central_numero: sessao.central_numero,
          foto_url: url,
          motivo: sessao.ultimo_identificador
            ? "Identificador informado não corresponde a um dispositivo."
            : "Foto recebida antes de informar o dispositivo.",
          telefone_origem: origem,
        });
      }
      await deps.atualizarSessaoFoto(tel, { ultima_msg_id: e.messageId ?? null });
      await deps.enviar(
        envio,
        "⚠️ Ainda não identifiquei o dispositivo, então guardei esta foto para *revisão* " +
          "(ela não foi perdida). Envie o identificador do dispositivo antes das fotos."
      );
      return true;
    }

    const url = await deps.subirFoto(sessao.dispositivo_id, e.imageUrl, suffixFoto(e));
    if (!url) {
      await deps.atualizarSessaoFoto(tel, { ultima_msg_id: e.messageId ?? null });
      await deps.enviar(envio, "⚠️ Não consegui processar esta foto. Tente enviá-la novamente.");
      return true;
    }
    const { total } = await deps.anexarFotoDispositivo(sessao.dispositivo_id, url);
    await deps.atualizarSessaoFoto(tel, { ultima_msg_id: e.messageId ?? null });
    await deps.enviar(
      envio,
      `📷 Foto ${total} registrada no dispositivo *${sessao.ultimo_identificador ?? ""}*. ` +
        "Envie mais fotos, outro identificador, ou *encerrar dispositivo*."
    );
    return true;
  }

  // ── A text: treat it as a new device identifier ─────────────────────────────
  if (texto) {
    const candidatos = await deps.listarCandidatos(sessao.central_numero);
    const r = resolverDispositivo(texto, candidatos);

    if (r.tipo === "unico") {
      await deps.atualizarSessaoFoto(tel, {
        dispositivo_id: r.dispositivo.id,
        ultimo_identificador: texto,
        ultima_msg_id: e.messageId ?? null,
      });
      await deps.enviar(
        envio,
        `✅ Dispositivo selecionado: *${rotuloCandidato(r.dispositivo)}*.\n` +
          "Pode enviar as fotos agora."
      );
      return true;
    }

    if (r.tipo === "ambiguo") {
      // Don't pick one arbitrarily — ask the supervisor to be more specific.
      const lista = r.candidatos
        .slice(0, 8)
        .map((c, i) => `${i + 1}) ${rotuloCandidato(c)}`)
        .join("\n");
      await deps.atualizarSessaoFoto(tel, {
        dispositivo_id: null,
        ultimo_identificador: texto,
        ultima_msg_id: e.messageId ?? null,
      });
      await deps.enviar(
        envio,
        `❓ Encontrei ${r.candidatos.length} dispositivos para *${texto}*. ` +
          "Seja mais específico (ex.: inclua o endereço):\n" +
          lista
      );
      return true;
    }

    // No match. Remember the identifier so a photo sent next gets parked with it.
    await deps.atualizarSessaoFoto(tel, {
      dispositivo_id: null,
      ultimo_identificador: texto,
      ultima_msg_id: e.messageId ?? null,
    });
    await deps.enviar(
      envio,
      `⚠️ Não encontrei um dispositivo para *${texto}*. ` +
        "Confira o identificador. Se enviar fotos assim mesmo, vou guardá-las para revisão (não serão perdidas)."
    );
    return true;
  }

  return true;
}
