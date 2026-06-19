// Pure matching logic for the device-photo WhatsApp flow.
//
// A supervisor names a device, then sends its photos. The "name" they type is
// free-text; we resolve it to exactly one device. Two identifier styles are
// supported, tried in order:
//
//   1. endereco — the loop address, e.g. "L1.05", "1.05", "L1-05". This is the
//      precise identifier and wins when present.
//   2. setor + tipo — e.g. "Torrefacao sirene", "sirene torrefacao". Matches by
//      sector name (accent/case-insensitive) AND device type keyword. Used while
//      addresses aren't filled in yet (incremental data).
//
// resolverDispositivo returns a single match, a list of ambiguous candidates, or
// nothing — the caller decides what to do (attach / ask to disambiguate / park
// the photo for review). No DB access here, so it's fully unit-tested.

export interface DispositivoCandidato {
  id: string;
  central_id: string;
  central_numero?: number | null;
  laco: number | null;
  endereco: string | null;
  tipo_dispositivo: string;
  setor: string | null;
}

export type Resultado =
  | { tipo: "unico"; dispositivo: DispositivoCandidato }
  | { tipo: "ambiguo"; candidatos: DispositivoCandidato[] }
  | { tipo: "nenhum" };

// Maps Portuguese type keywords a supervisor might type → the canonical
// tipo_dispositivo enum value. Several synonyms per type.
const PALAVRAS_TIPO: Record<string, string> = {
  fumaca: "detector_fumaca", fumaça: "detector_fumaca", fumacca: "detector_fumaca",
  temperatura: "detector_temperatura", termico: "detector_temperatura", térmico: "detector_temperatura",
  linear: "detector_linear", barreira: "detector_linear",
  acionador: "acionador", botoeira: "acionador", acionamento: "acionador", manual: "acionador",
  sirene: "sirene", sirena: "sirene", alarme: "sirene", audiovisual: "sirene",
  modulo: "modulo_supervisao", módulo: "modulo_supervisao", supervisao: "modulo_supervisao", supervisão: "modulo_supervisao",
  isolador: "isolador",
};

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokens(s: string): string[] {
  return semAcento(s.toLowerCase()).split(/[^a-z0-9]+/).filter(Boolean);
}

// Extracts a canonical tipo_dispositivo from the identifier, if any keyword
// appears. Returns null when no type word is present.
export function extrairTipo(identificador: string): string | null {
  for (const t of tokens(identificador)) {
    if (PALAVRAS_TIPO[t]) return PALAVRAS_TIPO[t];
    // also handle accented keys mapped via semAcento above (e.g. "fumaça"→"fumaca")
  }
  return null;
}

// Heuristic: does the identifier look like a loop address? Addresses are mostly
// digits/dots/dashes with an optional leading L (laço). e.g. "L1.05", "1.05".
export function pareceEndereco(identificador: string): boolean {
  return /^l?\s*\d{1,3}[.\-/]\d{1,3}$/i.test(identificador.trim());
}

// Normalises an address for comparison: lowercase, strip a leading "L", unify
// separators to a dot. "L1.05" / "1-05" / "l1/05" → "1.05".
export function normalizarEndereco(endereco: string): string {
  return semAcento(endereco.toLowerCase())
    .replace(/^l\s*/i, "")
    .replace(/[\s\-/]+/g, ".")
    .replace(/\.+/g, ".")
    .trim();
}

// Resolves a typed identifier against the candidate devices (already scoped to
// the relevant central by the caller, or the full active set).
export function resolverDispositivo(
  identificador: string,
  candidatos: DispositivoCandidato[]
): Resultado {
  const idTrim = identificador.trim();
  if (!idTrim) return { tipo: "nenhum" };

  // 1) Address match (precise).
  if (pareceEndereco(idTrim)) {
    const alvo = normalizarEndereco(idTrim);
    const porEndereco = candidatos.filter(
      (c) => c.endereco && normalizarEndereco(c.endereco) === alvo
    );
    if (porEndereco.length === 1) return { tipo: "unico", dispositivo: porEndereco[0] };
    if (porEndereco.length > 1) return { tipo: "ambiguo", candidatos: porEndereco };
    // fall through: address-looking but unmatched → try setor+tipo below
  }

  // 2) setor + tipo match.
  const tipo = extrairTipo(idTrim);
  const palavras = tokens(idTrim).filter((t) => !PALAVRAS_TIPO[t]); // sector words
  let pool = candidatos;
  if (tipo) pool = pool.filter((c) => c.tipo_dispositivo === tipo);
  if (palavras.length > 0) {
    pool = pool.filter((c) => {
      if (!c.setor) return false;
      const setorTokens = new Set(tokens(c.setor));
      // every sector word the supervisor typed must appear in the device's setor
      return palavras.every((w) => setorTokens.has(w));
    });
  }

  if (pool.length === 1) return { tipo: "unico", dispositivo: pool[0] };
  if (pool.length > 1) return { tipo: "ambiguo", candidatos: pool };
  return { tipo: "nenhum" };
}

// Short pt-BR label for a candidate, used when asking the supervisor to
// disambiguate ("qual? 1) Sirene — Torrefação L1.05").
export function rotuloCandidato(c: DispositivoCandidato): string {
  const partes: string[] = [];
  if (c.setor) partes.push(c.setor);
  if (c.endereco) partes.push(c.endereco);
  else if (c.laco != null) partes.push(`Laço ${c.laco}`);
  return partes.join(" — ") || c.id.slice(0, 8);
}
