// Brazilian mobile phone normalization.
//
// Rule: strip everything that isn't a digit, then keep the last 11 digits.
// 11 digits = DDD (2) + 9-digit mobile (9) — the canonical Brazilian format.
//
// Examples that all normalize to "11912345678":
//   "+55 11 91234-5678"   (E.164 with country code)
//   "5511912345678"        (country code, no punctuation)
//   "11912345678"          (DDD + number, no country code)
//   "11 91234-5678"        (DDD + number, formatted)
//   "(11) 9 1234-5678"     (formatted with parentheses)
//
// Why last 11 and not E.164 full form?
//   Z-API delivers phone in varying formats (sometimes with country prefix,
//   sometimes without). Keeping the last 11 digits produces a stable key
//   regardless of whether the sender includes "+55" or not — as long as the
//   DDD is present. A 10-digit input (old landline or truncated) is accepted
//   as-is after stripping; the uniqueness constraint still works because we
//   compare like for like.
//
// Throws if the cleaned string has fewer than 8 digits (clearly not a phone).

export const MIN_DIGITS = 8;
export const CANONICAL_DIGITS = 11;

export function normalizar(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (digits.length < MIN_DIGITS) {
    throw new Error(
      `Número de telefone inválido: "${telefone}" — deve conter pelo menos ${MIN_DIGITS} dígitos.`
    );
  }
  return digits.length > CANONICAL_DIGITS
    ? digits.slice(-CANONICAL_DIGITS)
    : digits;
}
