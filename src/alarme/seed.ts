// Idempotent seeder for fire-alarm devices.
//
// Each seed entry { central, setor, quantidade } expands into `quantidade`
// device rows. Every row gets a STABLE seed_key:
//     "<central_numero>|<tipo>|<setor>|<ordinal>"
// and is upserted on that key. Running the seed twice therefore never
// duplicates — the second run matches the same keys and no-ops. Devices created
// manually via the API have seed_key = null and are never touched by the seeder.
//
// endereco/laco are left NULL (awaiting addressing); cadastro_pendente stays
// true so partially-known devices are visibly incomplete.

import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { SEED_GRUPOS, type SeedSetor } from "./seedData";

const log = logger.child({ modulo: "alarme/seed" });

export interface SeedResultado {
  inseridos: number;
  jaExistiam: number;
  porTipo: Record<string, number>;
}

function seedKey(centralNumero: number, tipo: string, setor: string, ordinal: number): string {
  return `${centralNumero}|${tipo}|${setor}|${ordinal}`;
}

export async function seedDispositivosAlarme(): Promise<SeedResultado> {
  // Map central numero -> id once.
  const { data: centrais, error: errC } = await supabaseAdmin
    .from("centrais")
    .select("id, numero");
  if (errC) throw new Error(`Erro ao ler centrais: ${errC.message}`);
  const idPorNumero = new Map<number, string>((centrais ?? []).map((c: any) => [c.numero, c.id]));

  // Build the full desired device list with stable seed_keys.
  type Row = {
    central_id: string; tipo_dispositivo: string; setor: string;
    seed_key: string; endereco: null; laco: null; cadastro_pendente: true;
  };
  const desejados: Row[] = [];
  for (const grupo of SEED_GRUPOS) {
    for (const item of grupo.dados as SeedSetor[]) {
      const central_id = idPorNumero.get(item.central);
      if (!central_id) {
        log.warn({ central: item.central, tipo: grupo.tipo }, "central inexistente no seed — item ignorado");
        continue;
      }
      for (let i = 1; i <= item.quantidade; i++) {
        desejados.push({
          central_id,
          tipo_dispositivo: grupo.tipo,
          setor: item.setor,
          seed_key: seedKey(item.central, grupo.tipo, item.setor, i),
          endereco: null,
          laco: null,
          cadastro_pendente: true,
        });
      }
    }
  }

  // Which seed_keys already exist? (so we can report inserted vs pre-existing)
  const { data: existentes, error: errE } = await supabaseAdmin
    .from("dispositivos_alarme")
    .select("seed_key")
    .not("seed_key", "is", null);
  if (errE) throw new Error(`Erro ao ler dispositivos existentes: ${errE.message}`);
  const jaExistentes = new Set<string>((existentes ?? []).map((r: any) => r.seed_key));

  const novos = desejados.filter((d) => !jaExistentes.has(d.seed_key));

  // Upsert on seed_key — idempotent. Insert in chunks to stay within payload limits.
  const porTipo: Record<string, number> = {};
  if (novos.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < novos.length; i += CHUNK) {
      const lote = novos.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin
        .from("dispositivos_alarme")
        .upsert(lote, { onConflict: "seed_key", ignoreDuplicates: true });
      if (error) throw new Error(`Erro ao inserir dispositivos: ${error.message}`);
    }
    for (const n of novos) porTipo[n.tipo_dispositivo] = (porTipo[n.tipo_dispositivo] ?? 0) + 1;
  }

  const resultado: SeedResultado = {
    inseridos: novos.length,
    jaExistiam: desejados.length - novos.length,
    porTipo,
  };
  log.info(resultado, "seed de dispositivos de alarme concluído");
  return resultado;
}
