// Storage-usage awareness for the device photographic record.
//
// ~500 devices × several photos each will accumulate. This module reports how
// much is stored and structures the data so a later "thin out / archive" job is
// trivial to add — without changing the photo-capture code:
//
//   - counts photos referenced by devices (fotos[] length) and pending (orphan)
//   - measures real bytes by listing the storage bucket objects under the
//     device prefixes (Supabase Storage list returns object metadata.size)
//   - flags devices that exceed a soft per-device photo cap (archive candidates)
//   - logs a one-line summary so growth is visible in the ops logs
//
// Nothing here deletes or moves files; it only observes and recommends. The
// archive strategy (see notaArquivamento) is documented for the follow-up job.

import { supabaseAdmin } from "../db-admin";
import { BUCKET } from "../fotos/storage";
import { logger } from "../logger";

const log = logger.child({ modulo: "alarme/armazenamento" });

// Soft cap: beyond this many photos per device, older ones are archive
// candidates (the capture flow never enforces it — this is advisory).
const FOTOS_POR_DISPOSITIVO_ALVO = 6;

export interface RelatorioArmazenamento {
  dispositivos_com_foto: number;
  total_fotos_dispositivos: number;
  total_fotos_pendentes: number;
  media_fotos_por_dispositivo: number;
  bytes_estimados: number;
  bytes_legivel: string;
  dispositivos_acima_do_alvo: Array<{ id: string; setor: string | null; endereco: string | null; qtd_fotos: number }>;
  alvo_fotos_por_dispositivo: number;
  nota_arquivamento: string;
}

function legivel(bytes: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

// Lists all objects under a storage prefix, paging through the API (it returns
// up to `limit` per call). Returns the summed size in bytes and object count.
async function medirPrefixo(prefixo: string): Promise<{ bytes: number; objetos: number }> {
  let bytes = 0, objetos = 0, offset = 0;
  const limite = 1000;
  // List sub-folders (one per device id) first, then objects inside each. The
  // Storage list API is shallow; we walk one level (dispositivos/<id>/) and sum.
  const { data: pastas, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(prefixo, { limit: limite });
  if (error) {
    log.warn({ prefixo, err: error.message }, "falha ao listar storage para medição");
    return { bytes: 0, objetos: 0 };
  }
  for (const entry of pastas ?? []) {
    // A "folder" entry has no metadata; descend into it.
    if (entry.id === null || entry.metadata == null) {
      let subOffset = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: objs } = await supabaseAdmin.storage
          .from(BUCKET)
          .list(`${prefixo}/${entry.name}`, { limit: limite, offset: subOffset });
        const lote = objs ?? [];
        for (const o of lote) {
          bytes += Number((o as any).metadata?.size ?? 0);
          objetos += 1;
        }
        if (lote.length < limite) break;
        subOffset += limite;
      }
    } else {
      bytes += Number((entry as any).metadata?.size ?? 0);
      objetos += 1;
    }
  }
  void offset;
  return { bytes, objetos };
}

const notaArquivamento =
  "Estrutura pronta para arquivamento: as fotos ficam em " +
  `'${BUCKET}/dispositivos/<id>/'. Um job futuro pode, por dispositivo acima do ` +
  `alvo (${FOTOS_POR_DISPOSITIVO_ALVO}), mover as fotos mais antigas para um ` +
  "bucket/prefixo 'arquivo/' e manter apenas as N mais recentes em fotos[], sem " +
  "alterar o fluxo de captura. Nada é apagado automaticamente.";

export async function relatorioArmazenamento(): Promise<RelatorioArmazenamento> {
  const { data: disps, error } = await supabaseAdmin
    .from("dispositivos_alarme")
    .select("id, setor, endereco, fotos")
    .eq("ativo", true);
  if (error) throw new Error(error.message);

  let dispositivosComFoto = 0, totalFotos = 0;
  const acimaDoAlvo: RelatorioArmazenamento["dispositivos_acima_do_alvo"] = [];
  for (const d of (disps ?? []) as any[]) {
    const n = (d.fotos ?? []).length;
    if (n > 0) dispositivosComFoto += 1;
    totalFotos += n;
    if (n > FOTOS_POR_DISPOSITIVO_ALVO) {
      acimaDoAlvo.push({ id: d.id, setor: d.setor ?? null, endereco: d.endereco ?? null, qtd_fotos: n });
    }
  }

  const { count: pendentes } = await supabaseAdmin
    .from("dispositivo_fotos_pendentes")
    .select("id", { count: "exact", head: true })
    .eq("resolvido", false);

  const { bytes } = await medirPrefixo("dispositivos");

  const relatorio: RelatorioArmazenamento = {
    dispositivos_com_foto: dispositivosComFoto,
    total_fotos_dispositivos: totalFotos,
    total_fotos_pendentes: pendentes ?? 0,
    media_fotos_por_dispositivo:
      dispositivosComFoto > 0 ? Number((totalFotos / dispositivosComFoto).toFixed(2)) : 0,
    bytes_estimados: bytes,
    bytes_legivel: legivel(bytes),
    dispositivos_acima_do_alvo: acimaDoAlvo.sort((a, b) => b.qtd_fotos - a.qtd_fotos),
    alvo_fotos_por_dispositivo: FOTOS_POR_DISPOSITIVO_ALVO,
    nota_arquivamento: notaArquivamento,
  };

  log.info(
    {
      dispositivos_com_foto: relatorio.dispositivos_com_foto,
      total_fotos: relatorio.total_fotos_dispositivos,
      pendentes: relatorio.total_fotos_pendentes,
      armazenamento: relatorio.bytes_legivel,
      acima_do_alvo: acimaDoAlvo.length,
    },
    "relatório de armazenamento de fotos de dispositivos"
  );

  return relatorio;
}
