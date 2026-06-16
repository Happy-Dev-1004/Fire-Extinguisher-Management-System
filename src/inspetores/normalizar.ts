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

// Brazilian mobile numbers may be delivered by WhatsApp/Z-API WITH or WITHOUT
// the extra 9th digit (e.g. DDD 73): "5573988020347" (with 9) vs "557388020347"
// (without). normalizar() keeping the last 11 digits then yields DIFFERENT keys
// for the same person, so an inspector stored one way but messaging the other
// way is not recognised — their photos are silently ignored.
//
// variantesTelefone() returns BOTH canonical forms (with and without the 9),
// so a lookup can match either. For an 11-digit "DD9XXXXXXXX" it also yields the
// 10-digit "DDXXXXXXXX", and vice-versa. Always includes the plain normalized
// value too. Used by all phone lookups (authorization, session, region context).
export function variantesTelefone(telefone: string): string[] {
  let digits = telefone.replace(/\D/g, "");
  if (digits.length < MIN_DIGITS) return [];

  // Strip the Brazilian country code "55" FIRST, so length-based reasoning about
  // DDD + subscriber is correct regardless of whether the 9th digit is present.
  // Without this, slicing the last 11 of a 12-digit (no-9) number keeps part of
  // the "55" as if it were the DDD, producing a wrong key.
  if (digits.length >= 12 && digits.startsWith("55")) {
    digits = digits.slice(2);
  }

  const out = new Set<string>();
  // Now `digits` is DDD(2) + subscriber. Subscriber is 8 (no 9) or 9 (with 9).
  if (digits.length === 11 && digits[2] === "9") {
    out.add(digits);                                   // with 9
    out.add(digits.slice(0, 2) + digits.slice(3));     // without 9
  } else if (digits.length === 10) {
    out.add(digits);                                   // without 9
    out.add(digits.slice(0, 2) + "9" + digits.slice(2)); // with 9 inserted
  } else {
    // Unusual length — fall back to the plain normalized key.
    out.add(normalizar(telefone));
  }
  return [...out];
}
