import { supabaseAdmin } from "../db-admin";
import { logger } from "../logger";
import { decrypt } from "./cripto";

const log = logger.child({ modulo: "getSecret" });

// Maps each canonical secret name to its .env fallback variable name.
// If the DB row is absent, the .env value is used and a warning is logged.
const ENV_FALLBACK: Record<string, string> = {
  OPENAI_API_KEY:      "OPENAI_API_KEY",
  ZAPI_INSTANCE_ID:    "ZAPI_INSTANCE_ID",
  ZAPI_TOKEN:          "ZAPI_TOKEN",
  ZAPI_CLIENT_TOKEN:   "ZAPI_CLIENT_TOKEN",
  WHATSAPP_NUMERO:     "WHATSAPP_NUMERO",
  RESEND_API_KEY:      "RESEND_API_KEY",
  RESEND_FROM:         "RESEND_FROM",
};

/**
 * Returns the plaintext value of a secret.
 *
 * Resolution order:
 *   1. DB `configuracoes` row → decrypt with MASTER_ENCRYPTION_KEY
 *   2. .env fallback variable → use directly (logs a warning)
 *   3. Neither found → throws
 *
 * This is the ONLY server-side path that ever yields a plaintext secret.
 * It is never called from any HTTP route handler.
 */
export async function getSecret(nome: string): Promise<string> {
  // ── 1. Try DB ──────────────────────────────────────────────────────────────
  const { data, error } = await supabaseAdmin
    .from("configuracoes")
    .select("ciphertext, iv, auth_tag")
    .eq("nome", nome)
    .maybeSingle();

  if (error) {
    log.warn({ err: error.message, nome }, "erro ao buscar segredo no banco — tentando fallback .env");
  }

  if (data?.ciphertext && data?.iv && data?.auth_tag) {
    try {
      const plaintext = decrypt({
        iv:         data.iv,
        ciphertext: data.ciphertext,
        auth_tag:   data.auth_tag,
      });
      log.info({ nome, fonte: "banco" }, "segredo carregado do banco de dados");
      return plaintext;
    } catch (decryptErr: any) {
      // Decryption failure is a hard error — don't silently fall back to .env
      // because the DB value exists but is unreadable (wrong key or tampered).
      log.error({ nome, err: decryptErr.message }, "falha ao descriptografar segredo — verifique MASTER_ENCRYPTION_KEY");
      throw new Error(`Falha ao descriptografar segredo '${nome}': ${decryptErr.message}`);
    }
  }

  // ── 2. .env fallback ───────────────────────────────────────────────────────
  const envVar = ENV_FALLBACK[nome];
  if (envVar) {
    const envVal = process.env[envVar]?.trim();
    if (envVal) {
      log.warn({ nome, envVar, fonte: "env" }, "segredo não encontrado no banco — usando fallback do .env");
      return envVal;
    }
  }

  // ── 3. Not found anywhere ──────────────────────────────────────────────────
  throw new Error(
    `Segredo '${nome}' não configurado. Salve-o via GET /configuracoes ou defina ${envVar ?? nome} no .env.`
  );
}
