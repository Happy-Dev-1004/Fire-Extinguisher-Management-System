// Real (Supabase-backed) implementation of the device-photo engine deps.
// Keeps fotosDispositivo.ts pure/testable; this wires it to the live system.

import { supabaseAdmin } from "../db-admin";
import { sendWhatsAppMessage } from "../notificacao/zapi";
import { uploadFotoUrl } from "../fotos/storage";
import { logger } from "../logger";
import type { Deps, SessaoFoto } from "./fotosDispositivo";
import type { DispositivoCandidato } from "./fotosMatcher";

const log = logger.child({ modulo: "alarme/fotosDispositivoDeps" });

const COLS_SESSAO =
  "telefone_normalizado, dispositivo_id, central_numero, ultimo_identificador, ultima_msg_id";

export const fotosDispositivoDeps: Deps = {
  async getSessaoFoto(tel) {
    const { data } = await supabaseAdmin
      .from("dispositivo_foto_sessoes")
      .select(COLS_SESSAO)
      .eq("telefone_normalizado", tel)
      .maybeSingle();
    return (data as SessaoFoto | null) ?? null;
  },

  async abrirSessaoFoto(tel, centralNumero) {
    // Upsert so re-entering the mode doesn't error on the PK.
    const { data, error } = await supabaseAdmin
      .from("dispositivo_foto_sessoes")
      .upsert(
        {
          telefone_normalizado: tel,
          central_numero: centralNumero,
          dispositivo_id: null,
          ultimo_identificador: null,
          ultima_msg_id: null,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "telefone_normalizado" }
      )
      .select(COLS_SESSAO)
      .single();
    if (error) throw new Error(`Erro ao abrir sessão de foto: ${error.message}`);
    return data as SessaoFoto;
  },

  async atualizarSessaoFoto(tel, patch) {
    await supabaseAdmin
      .from("dispositivo_foto_sessoes")
      .update({ ...patch, atualizado_em: new Date().toISOString() })
      .eq("telefone_normalizado", tel);
  },

  async apagarSessaoFoto(tel) {
    await supabaseAdmin.from("dispositivo_foto_sessoes").delete().eq("telefone_normalizado", tel);
  },

  async listarCandidatos(centralNumero) {
    // Join the central to expose numero, and scope to the supervisor's central
    // when known (smaller, less-ambiguous candidate set). Only active devices.
    let q = supabaseAdmin
      .from("dispositivos_alarme")
      .select("id, central_id, laco, endereco, tipo_dispositivo, setor, centrais!inner(numero)")
      .eq("ativo", true);
    if (centralNumero != null) q = q.eq("centrais.numero", centralNumero);

    const { data, error } = await q;
    if (error) {
      log.error({ err: error.message }, "erro ao listar candidatos de dispositivo");
      return [];
    }
    return (data ?? []).map((d: any) => ({
      id: d.id,
      central_id: d.central_id,
      central_numero: d.centrais?.numero ?? null,
      laco: d.laco ?? null,
      endereco: d.endereco ?? null,
      tipo_dispositivo: d.tipo_dispositivo,
      setor: d.setor ?? null,
    })) as DispositivoCandidato[];
  },

  async anexarFotoDispositivo(dispositivoId, url) {
    // Atomic append + auto-mark-installed via the RPC.
    const { data, error } = await supabaseAdmin.rpc("append_foto_dispositivo", {
      p_id: dispositivoId,
      p_foto: url,
    });
    if (error) {
      // Fallback: read-modify-write (sessions are serialized per phone anyway).
      log.warn({ err: error.message }, "rpc append_foto_dispositivo indisponível — fallback");
      const { data: atual } = await supabaseAdmin
        .from("dispositivos_alarme")
        .select("fotos, status_instalacao, data_instalacao")
        .eq("id", dispositivoId)
        .maybeSingle();
      const fotos = [...(((atual as any)?.fotos as string[]) ?? []), url];
      const hoje = new Date().toISOString().slice(0, 10);
      await supabaseAdmin
        .from("dispositivos_alarme")
        .update({
          fotos,
          status_instalacao:
            (atual as any)?.status_instalacao === "pendente"
              ? "instalado"
              : (atual as any)?.status_instalacao,
          data_instalacao: (atual as any)?.data_instalacao ?? hoje,
        })
        .eq("id", dispositivoId);
      return { total: fotos.length };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { total: (row?.fotos as string[] | undefined)?.length ?? 1 };
  },

  async registrarFotoPendente(input) {
    const { error } = await supabaseAdmin.from("dispositivo_fotos_pendentes").insert({
      identificador: input.identificador,
      central_numero: input.central_numero,
      foto_url: input.foto_url,
      motivo: input.motivo,
      telefone_origem: input.telefone_origem,
    });
    if (error) {
      // Last-resort: never throw away a photo silently — log loudly with the URL
      // so it can be recovered manually from the logs.
      log.error(
        { err: error.message, foto_url: input.foto_url },
        "FALHA ao registrar foto pendente — foto preservada apenas no log"
      );
    }
  },

  async enviar(tel, texto) {
    await sendWhatsAppMessage(tel, texto);
  },

  async subirFoto(prefixoOuId, imageUrl, suffix) {
    // Stored under dispositivos/<id>/ (or dispositivo-pendente/ for orphans).
    const prefixo =
      prefixoOuId === "dispositivo-pendente"
        ? "dispositivo-pendente"
        : `dispositivos/${prefixoOuId}`;
    return uploadFotoUrl(prefixo, imageUrl, suffix);
  },

  hojeISO() {
    return new Date().toISOString().slice(0, 10);
  },
};
