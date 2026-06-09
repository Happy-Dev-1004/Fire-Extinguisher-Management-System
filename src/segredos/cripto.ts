import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM authenticated encryption.
//
// Why GCM: it provides both confidentiality (AES) and integrity (GHASH auth tag).
// A tampered ciphertext will fail authentication before any decryption output is
// produced — the caller gets an error, never garbage plaintext.
//
// Key: 32 bytes (256 bits), supplied as a 64-char hex string via MASTER_ENCRYPTION_KEY.
// IV:  12 bytes random per encryption (GCM recommended size).
// Tag: 16 bytes (128-bit auth tag, GCM default).
//
// Stored in DB as three separate text columns: iv (hex), ciphertext (hex), auth_tag (hex).

const ALGORITHM  = "aes-256-gcm";
const IV_BYTES   = 12;
const TAG_BYTES  = 16;
const KEY_HEX_LEN = 64; // 32 bytes × 2 hex chars

export interface CifraTexto {
  iv:         string; // hex
  ciphertext: string; // hex
  auth_tag:   string; // hex
}

function getMasterKey(): Buffer {
  const hex = process.env.MASTER_ENCRYPTION_KEY?.trim();
  if (!hex || hex.length !== KEY_HEX_LEN) {
    throw new Error(
      `MASTER_ENCRYPTION_KEY deve ser uma string hex de ${KEY_HEX_LEN} caracteres (32 bytes). ` +
      `Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns hex-encoded iv, ciphertext, and auth_tag — all safe to store in the DB.
 * Throws if MASTER_ENCRYPTION_KEY is missing or malformed.
 */
export function encrypt(plaintext: string): CifraTexto {
  const key    = getMasterKey();
  const iv     = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    iv:         iv.toString("hex"),
    ciphertext: encrypted.toString("hex"),
    auth_tag:   authTag.toString("hex"),
  };
}

/**
 * Decrypts a CifraTexto produced by encrypt().
 * Throws if:
 *   - MASTER_ENCRYPTION_KEY is missing or wrong
 *   - auth_tag does not match (tampered ciphertext or wrong key) → "Unsupported state or unable to authenticate data"
 *   - iv/ciphertext/auth_tag are not valid hex
 */
export function decrypt(cifra: CifraTexto): string {
  const key      = getMasterKey();
  const iv       = Buffer.from(cifra.iv,         "hex");
  const data     = Buffer.from(cifra.ciphertext,  "hex");
  const authTag  = Buffer.from(cifra.auth_tag,    "hex");

  if (authTag.length !== TAG_BYTES) {
    throw new Error("auth_tag inválido — tamanho incorreto");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final(), // throws here if auth tag doesn't match
  ]);

  return decrypted.toString("utf8");
}

/**
 * Masks a secret for display: shows first 4 + last 4 chars with bullets in between.
 * Values shorter than 12 chars are fully masked.
 */
export function mascarar(valor: string): string {
  if (valor.length < 12) return "••••••••";
  return `${valor.slice(0, 4)}••••${valor.slice(-4)}`;
}
