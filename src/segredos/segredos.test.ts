import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock state ─────────────────────────────────────────────────────────
const { maybeSingleFn, fromFn, logChild } = vi.hoisted(() => {
  const maybeSingleFn = vi.fn();
  const eqFn          = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn });
  const selectFn      = vi.fn().mockReturnValue({ eq: eqFn });
  const fromFn        = vi.fn().mockReturnValue({ select: selectFn });
  const logFns        = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logChild      = vi.fn().mockReturnValue(logFns);
  return { maybeSingleFn, fromFn, logChild };
});

vi.mock("../db-admin", () => ({ supabaseAdmin: { from: fromFn } }));
vi.mock("../logger",   () => ({ logger: { child: logChild } }));

import { encrypt, decrypt, mascarar } from "./cripto";
import { getSecret } from "./getSecret";

// A valid 64-char hex key for tests
const TEST_KEY = "a".repeat(64);

// ── cripto.ts ─────────────────────────────────────────────────────────────────
describe("encrypt / decrypt", () => {
  beforeEach(() => {
    process.env.MASTER_ENCRYPTION_KEY = TEST_KEY;
  });

  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const plain = "sk-test-secret-value-12345";
    const cifra = encrypt(plain);
    expect(decrypt(cifra)).toBe(plain);
  });

  it("each encrypt call produces a different IV (random IV)", () => {
    const a = encrypt("same-value");
    const b = encrypt("same-value");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("tampered ciphertext fails GCM authentication", () => {
    const cifra = encrypt("some-secret");
    const tampered = {
      ...cifra,
      ciphertext: cifra.ciphertext.slice(0, -2) + "ff",
    };
    expect(() => decrypt(tampered)).toThrow();
  });

  it("tampered auth_tag fails authentication", () => {
    const cifra = encrypt("some-secret");
    const tampered = {
      ...cifra,
      auth_tag: "00".repeat(16),
    };
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when MASTER_ENCRYPTION_KEY is missing", () => {
    delete process.env.MASTER_ENCRYPTION_KEY;
    expect(() => encrypt("value")).toThrow(/MASTER_ENCRYPTION_KEY/);
  });

  it("throws when MASTER_ENCRYPTION_KEY is too short", () => {
    process.env.MASTER_ENCRYPTION_KEY = "abc123";
    expect(() => encrypt("value")).toThrow(/MASTER_ENCRYPTION_KEY/);
  });
});

describe("mascarar", () => {
  it("shows first 4 and last 4 chars for long values", () => {
    expect(mascarar("sk-proj-abcdefgh1234")).toBe("sk-p••••1234");
  });

  it("fully masks values shorter than 12 chars", () => {
    expect(mascarar("short")).toBe("••••••••");
    expect(mascarar("11-char-val")).toBe("••••••••"); // 11 chars → fully masked
  });

  it("partially masks exactly 12-char values", () => {
    expect(mascarar("12-char-val!")).toBe("12-c••••val!"); // 12 chars → partial mask
  });
});

// ── getSecret.ts ──────────────────────────────────────────────────────────────
describe("getSecret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MASTER_ENCRYPTION_KEY = TEST_KEY;
  });

  function makeCifra(plain: string) {
    return encrypt(plain);
  }

  it("returns decrypted value from DB when row exists", async () => {
    const plain = "sk-real-openai-key-here";
    const cifra = makeCifra(plain);

    maybeSingleFn.mockResolvedValue({
      data:  { ciphertext: cifra.ciphertext, iv: cifra.iv, auth_tag: cifra.auth_tag },
      error: null,
    });

    const result = await getSecret("OPENAI_API_KEY");
    expect(result).toBe(plain);
  });

  it("falls back to .env when DB row is absent", async () => {
    maybySingleFn: maybeSingleFn.mockResolvedValue({ data: null, error: null });
    process.env.OPENAI_API_KEY = "sk-from-env";

    const result = await getSecret("OPENAI_API_KEY");
    expect(result).toBe("sk-from-env");
  });

  it("throws hard when DB row exists but decrypt fails (wrong key / tampered)", async () => {
    maybeSingleFn.mockResolvedValue({
      data:  { ciphertext: "deadbeef", iv: "deadbeef".repeat(3), auth_tag: "00".repeat(16) },
      error: null,
    });

    await expect(getSecret("OPENAI_API_KEY")).rejects.toThrow();
  });

  it("throws when neither DB nor .env has the secret", async () => {
    maybeSingleFn.mockResolvedValue({ data: null, error: null });
    delete process.env.OPENAI_API_KEY;

    await expect(getSecret("OPENAI_API_KEY")).rejects.toThrow(/não configurado/);
  });
});
