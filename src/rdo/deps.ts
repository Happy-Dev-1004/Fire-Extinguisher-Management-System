// Real (Supabase-backed) implementation of the RDO engine dependencies.
// Keeps maquina.ts pure/testable; this file wires it to the live system.

import { supabaseAdmin } from "../db-admin";
import { sendWhatsAppMessage } from "../notificacao/zapi";
import { uploadFotoUrl } from "../fotos/storage";
import { logger } from "../logger";
import { registrarNotificacao } from "../notificacao/notificacoes";
import type { Deps, Sessao } from "./maquina";
import type { Pergunta } from "./perguntas";

const log = logger.child({ modulo: "rdo/deps" });

// Counts, per device type, the alarm devices marked as installed on a given date
// in the dashboard (dispositivos_alarme.data_instalacao = date). This replaces
// the manual "quantos instalou hoje?" questions — the RDO now derives the numbers
// from the real device registry, so they always match. Optionally scoped to a
// central (the RDO's "central" field carries the panel number, e.g. "Central 3").
export async function contarDispositivosInstaladosNoDia(
  dataISO: string | null | undefined,
  centralTexto?: string | null,
): Promise<Record<string, number>> {
  if (!dataISO) return {};
  let centralId: string | undefined;
  const m = String(centralTexto ?? "").match(/\b([1-9]\d?)\b/);
  if (m) {
    const { data: c } = await supabaseAdmin
      .from("centrais").select("id").eq("numero", Number(m[1])).maybeSingle();
    if (c) centralId = (c as any).id;
  }

  let q = supabaseAdmin
    .from("dispositivos_alarme")
    .select("tipo_dispositivo")
    .eq("ativo", true)
    .eq("data_instalacao", dataISO);
  if (centralId) q = q.eq("central_id", centralId);

  const { data, error } = await q;
  if (error) {
    log.warn({ err: error.message, dataISO }, "falha ao contar dispositivos instalados no dia");
    return {};
  }
  const contagem: Record<string, number> = {};
  for (const row of (data ?? []) as { tipo_dispositivo: string }[]) {
    contagem[row.tipo_dispositivo] = (contagem[row.tipo_dispositivo] ?? 0) + 1;
  }
  return contagem;
}

export const rdoDeps: Deps = {
  async getSessao(tel) {
    const { data } = await supabaseAdmin
      .from("rdo_sessoes")
      .select("telefone_normalizado, rdo_id, etapa, ultima_msg_id, aguardando_fotos")
      .eq("telefone_normalizado", tel)
      .maybeSingle();
    return (data as Sessao | null) ?? null;
  },

  async criarSessao(tel, rdoId) {
    const { data, error } = await supabaseAdmin
      .from("rdo_sessoes")
      .insert({ telefone_normalizado: tel, rdo_id: rdoId, etapa: 0, aguardando_fotos: false })
      .select("telefone_normalizado, rdo_id, etapa, ultima_msg_id, aguardando_fotos")
      .single();
    if (error) throw new Error(`Erro ao criar sessão RDO: ${error.message}`);
    return data as Sessao;
  },

  async atualizarSessao(tel, patch) {
    await supabaseAdmin
      .from("rdo_sessoes")
      .update({ ...patch, atualizado_em: new Date().toISOString() })
      .eq("telefone_normalizado", tel);
  },

  async apagarSessao(tel) {
    await supabaseAdmin.from("rdo_sessoes").delete().eq("telefone_normalizado", tel);
  },

  async criarRdo(telefoneOrigem) {
    const { data, error } = await supabaseAdmin
      .from("rdos")
      .insert({ telefone_origem: telefoneOrigem, status: "em_andamento" })
      .select("id")
      .single();
    if (error) throw new Error(`Erro ao criar RDO: ${error.message}`);
    return data.id as string;
  },

  async setCampoRdo(rdoId, destino: Pergunta["destino"], valor) {
    if (destino.coluna) {
      await supabaseAdmin.from("rdos").update({ [destino.coluna]: valor }).eq("id", rdoId);
      return;
    }
    if (destino.jsonb && destino.chave) {
      // Merge into the existing jsonb object (read-modify-write; sessions are
      // serialized per phone by the webhook queue, so no concurrent writer).
      const { data } = await supabaseAdmin
        .from("rdos").select(destino.jsonb).eq("id", rdoId).maybeSingle();
      const atual = ((data as any)?.[destino.jsonb] ?? {}) as Record<string, unknown>;
      atual[destino.chave] = valor;
      await supabaseAdmin.from("rdos").update({ [destino.jsonb]: atual }).eq("id", rdoId);
    }
  },

  async anexarFotoRdo(rdoId, url) {
    const { data } = await supabaseAdmin.from("rdos").select("fotos_dia").eq("id", rdoId).maybeSingle();
    const fotos = [ ...(((data as any)?.fotos_dia as string[]) ?? []), url ];
    await supabaseAdmin.from("rdos").update({ fotos_dia: fotos }).eq("id", rdoId);
  },

  async finalizarRdo(rdoId) {
    // Derive "dispositivos instalados hoje" automatically from the dashboard,
    // so the RDO count always matches the real device registry (no manual entry).
    const { data: base } = await supabaseAdmin
      .from("rdos").select("data, central").eq("id", rdoId).maybeSingle();
    const dispositivos_instalados = await contarDispositivosInstaladosNoDia(
      (base as any)?.data ?? null,
      (base as any)?.central ?? null,
    );

    const { data, error } = await supabaseAdmin
      .from("rdos")
      .update({ status: "concluido", concluido_em: new Date().toISOString(), dispositivos_instalados })
      .eq("id", rdoId)
      .select("*")
      .single();
    if (error) throw new Error(`Erro ao finalizar RDO: ${error.message}`);
    log.info({ rdoId, dispositivos_instalados }, "RDO concluído (dispositivos instalados calculados do painel)");
    const r = data as any;
    const dataBR = r.data ? String(r.data).split("-").reverse().join("/") : "—";
    void registrarNotificacao({
      tipo: "rdo",
      severidade: "sucesso",
      titulo: `RDO concluído · ${dataBR}`,
      mensagem: [r.responsavel, r.central, r.frente_trabalho].filter(Boolean).join(" · ") || undefined,
      metadata: { rdo_id: rdoId, data: r.data, responsavel: r.responsavel },
    });
    return data;
  },

  async cancelarRdo(rdoId) {
    await supabaseAdmin.from("rdos").update({ status: "cancelado" }).eq("id", rdoId);
  },

  async enviar(tel, texto) {
    await sendWhatsAppMessage(tel, texto);
  },

  async subirFoto(rdoId, imageUrl, suffix) {
    return uploadFotoUrl(`rdos/${rdoId}`, imageUrl, suffix);
  },

  hojeISO() {
    return new Date().toISOString().slice(0, 10);
  },
};
