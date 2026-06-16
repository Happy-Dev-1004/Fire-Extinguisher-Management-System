// Parses Ilhéus 201-300. Same format/quirks as parse-ilheus.mjs. Handles a
// duplicated #260 line and a stray leading space on #261. Includes new type
// "AP 10L". Dedupes by number (last wins) and checks for gaps 201-300.

const RAW = `
Extintor 201: ABC 6KG - Conimix 2 Pav.
Extintor 202: ABC 6KG - Conimix 2 Pav.
Extintor 203: ABC 6KG - Entrada laje área verm.
Extintor 204: ABC 6KG - Laje área vermelha
Extintor 205: ABC 6KG - Laje área vermelha
Extintor 206: ABC 6KG - Manteiga 1° Pav.
Extintor 207: ABC 6KG - Caldeira 1° Pav.
Extintor 208: ABC 6KG - setor:
Extintor 209: ABC 6KG - Laboratório sensorial
Extintor 210: ABC 6KG - Frente lab. Sensorial área ext.
Extintor 211: ABC 6KG - Sala Maq. Compressor amônia
Extintor 212: ABC 6KG - Sala Maq. Compressor amônia
Extintor 213: ABC 6KG - Sala Maq. Compressor amônia
Extintor 214: ABC 6KG - Sala Maq. Compressor amônia
Extintor 215: ABC 6KG - Sala compressores 1° Pav.
Extintor 216: ABC 6KG - MRS 123 1° Pav.
Extintor 217: ABC 6KG - Área de Pó
Extintor 218: ABC 6KG -  Armazém intermed. 1° Pav.
Extintor 219: ABC 6KG - Armazém intermed. 1° Pav.
Extintor 220: ABC 6KG - Área líquida
Extintor 221: CO2 6KG - Área líquida
Extintor 222: ABC 6KG - Prensas área branca
Extintor 223: ABC 6KG - Prensas área líquida
Extintor 224: ABC 6KG - Prensas área líquida
Extintor 225: CO2 6KG - Área sólida
Extintor 226: CO2 6KG - Secador área vermelha
Extintor 227: CO2 6KG - Caldeira
Extintor 228: ABC 6KG - Abaixo Plataf. Desmet.
Extintor 229: ABC 6KG - Área branca
Extintor 230: CO2 6KG - Área de Pó
Extintor 231: CO2 6KG - Reymond
Extintor 232: CO2 6KG - Moinho Reymond
Extintor 233: ABC 6KG - Moinho Reymond
Extintor 234: ABC 6KG - Reymond
Extintor 235: CO2 6KG - Produto acabado
Extintor 236: ABC 6KG - Embalagens
Extintor 237: CO2 6KG - Oficina
Extintor 238: CO2 6KG - Manutenção
Extintor 239: CO2 6KG - Sala compressores amônia 1° Pav.
Extintor 240: ABC 6KG - Acima manutenção
Extintor 241: ABC 6KG - Rampa ETA
Extintor 242: ABC 6KG - Rampa ETA
Extintor 243: ABC 6KG - Conimix 1° Pav.
Extintor 244: ABC 6KG - Conimix 3° Pav. Telhado
Extintor 245: CO2 6KG - CCM
Extintor 246: CO2 6KG - CCM
Extintor 247: CO2 6KG - Área branca
Extintor 248: ABC 6KG - Armazém intermediário
Extintor 249: BC 6KG - Área ext. Lado GLP
Extintor 250: AP 10L - Upstream
Extintor 251: AP 10L - Upstream
Extintor 252: AP 10L - Upstream
Extintor 253: AP 10L - Upstream
Extintor 254: AP 10L - Reserva
Extintor 255: AP 10L - Reserva
Extintor 256: AP 10L - Reserva
Extintor 257: AP 10L - Reserva
Extintor 258: AP 10L - Reserva
Extintor 259: AP 10L - Reserva
Extintor 260: AP 10L - Reserva
Extintor 261: AP 10L - Reserva
Extintor 262: AP 10L - Reserva
Extintor 263: AP 10L - Reserva
Extintor 264: AP 10L - Reserva
Extintor 265: AP 10L - Reserva
Extintor 266: AP 10L - Reserva
Extintor 267: AP 10L - Reserva
Extintor 268: AP 10L - Reserva
Extintor 269: ABC 6KG - Reserva
Extintor 270: ABC 6KG - Reserva
Extintor 271: ABC 6KG - Reserva
Extintor 272: ABC 6KG - Reserva
Extintor 273: ABC 6KG - Reserva
Extintor 274: ABC 6KG - Reserva
Extintor 275: ABC 6KG - Reserva
Extintor 276: ABC 6KG - Reserva
Extintor 277: ABC 6KG - Reserva
Extintor 278: ABC 6KG - Reserva
Extintor 279: ABC 6KG - Reserva
Extintor 280: ABC 6KG - Reserva
Extintor 281: ABC 6KG - Reserva
Extintor 282: ABC 6KG - Reserva
Extintor 283: ABC 6KG - Reserva
Extintor 284: ABC 20KG - Reserva
Extintor 285: ABC 6KG - Reserva
Extintor 286: CO2 6KG - Reserva
Extintor 287: CO2 6KG - Reserva
Extintor 288: CO2 6KG - Reserva
Extintor 289: CO2 6KG - Reserva
Extintor 290: CO2 6KG - Reserva
Extintor 291: CO2 6KG - Reserva
Extintor 292: CO2 6KG - Reserva
Extintor 293: CO2 6KG - Reserva
Extintor 294: CO2 6KG - Reserva
Extintor 295: CO2 6KG - Reserva
Extintor 296: CO2 6KG - Reserva
Extintor 297: CO2 6KG - Reserva
Extintor 298: CO2 6KG - Reserva
Extintor 299: CO2 6KG - Reserva
Extintor 300: CO2 6KG - Reserva
`;

function parseLine(line) {
  const m = line.match(/Extintor\s*0*(\d{1,4})\s*:\s*(.+)$/i);
  if (!m) return null;
  const numero = parseInt(m[1], 10);
  let resto = m[2].trim();
  let tipoRaw, setor;
  const sep = resto.search(/\s-\s|:\s/);
  if (sep >= 0) {
    const sepLen = resto.slice(sep).startsWith(" - ") ? 3 : 2;
    tipoRaw = resto.slice(0, sep).trim();
    setor   = resto.slice(sep + sepLen).trim();
  } else if (/-/.test(resto)) {
    const i = resto.indexOf("-"); tipoRaw = resto.slice(0,i).trim(); setor = resto.slice(i+1).trim();
  } else { tipoRaw = resto; setor = ""; }

  let tipo = tipoRaw.replace(/\s+/g," ").trim().toUpperCase()
    .replace(/^C02/, "CO2").replace(/\bC02\b/g,"CO2")
    .replace(/\s*KG/g,"kg").replace(/(\d)\s+kg/g,"$1kg")
    .replace(/\s*L\b/,"L");
  // strip a trailing "setor:" placeholder (#208) and trailing punctuation/spaces
  setor = setor.replace(/\bsetor:?\s*$/i, "").replace(/\s{2,}/g," ").replace(/[.\s]+$/,"").trim();
  return { numero, tipo, setor };
}

const seen = new Map();
RAW.split("\n").map(l=>l.trim()).filter(Boolean).map(parseLine).filter(Boolean)
  .forEach(r => seen.set(r.numero, r)); // dedupe #260
const rows = [...seen.values()].sort((a,b)=>a.numero-b.numero);
function esc(s){ return s.replace(/'/g,"''"); }

let out = `-- =============================================================================
-- MIGRATION 0020: Ilhéus data part 2 (extintores 201-300) — completes Ilhéus.
-- Idempotent. #208 had an empty "setor:" placeholder → stored as blank setor.
-- =============================================================================
-- ${rows.length} extintores Ilhéus (${rows[0].numero}-${rows[rows.length-1].numero})
`;
out += rows.map(r =>
  `UPDATE extintores SET tipo_carga='${esc(r.tipo)}', setor='${esc(r.setor)}' WHERE regiao='Ilhéus' AND numero_int=${r.numero};`
).join("\n");
console.log(out);

const nums = rows.map(r=>r.numero);
const missing=[]; for(let i=201;i<=300;i++) if(!nums.includes(i)) missing.push(i);
console.error(`rows=${rows.length}, missing 201-300: ${missing.length?missing.join(","):"none"}`);
console.error("distinct tipos:", [...new Set(rows.map(r=>r.tipo))].join(" | "));
console.error("#208:", JSON.stringify(seen.get(208)), " #250:", JSON.stringify(seen.get(250)), " #284:", JSON.stringify(seen.get(284)));
