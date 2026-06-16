// Parses the Ilhéus list (1-200) "Extintor NN: TIPO - SETOR" into UPDATE SQL.
// Handles type quirks: C02→CO2, 10A80BC / 4A80BC ratings, "BC 50KG", "ABC 30KG",
// "EM 10L", "CO2 4KG", and the odd "10A80BC 10 4,5KG". Separator between tipo and
// setor is usually " - " but a few lines use ": ".

const RAW = `
Extintor 01: ABC 6KG - ETE
Extintor 02: ABC 6KG - ETE
Extintor 03: ABC 6KG - ADM
Extintor 04: ABC 6KG - Recepção ADM
Extintor 05: ABC 6KG - ADM
Extintor 06: BC 6KG - Recepção ADM
Extintor 07: ABC 6KG - Garagem fundo ADM
Extintor 08: C02 6KG - CBR
Extintor 09: 10A80BC 10 4,5KG - CBR
Extintor 10: CO2 6KG - CBR
Extintor 11: ABC 6KG - Sala de sopradores
Extintor 12: ABC 6KG - Sala de sopradores
Extintor 13: ABC 6KG - Guarita
Extintor 14: ABC 6KG - Guarita
Extintor 15: ABC 6KG - Laboratório
Extintor 16: CO2 6KG - Entrada HSE
Extintor 17: ABC 6KG - Entrada HSE
Extintor 18: ABC 6KG - Em frente med. Ocup.
Extintor 19: ABC 6KG - RH
Extintor 20: ABC 6KG - RH
Extintor 21: ABC 6KG - Refeitório
Extintor 22: ABC 6KG - Entrada refeitório
Extintor 23: ABC 6KG - Cozinha
Extintor 24: ABC 6KG - Cozinha
Extintor 25: ABC 6KG - Área ext. Cozinha
Extintor 26: ABC 6KG - Área de lazer
Extintor 27: ABC 6KG - Área de lazer
Extintor 28: ABC 6KG - Em frente banheiro
Extintor 29: ABC 6KG - Produtos acabados
Extintor 30: ABC 6KG - Produtos acabados
Extintor 31: ABC 6KG - Produtos acabados
Extintor 32: ABC 6KG - Área de circulação
Extintor 33: ABC 6KG - Produtos acabados
Extintor 34: ABC 6KG - Produtos acabados
Extintor 35: ABC 6KG - Produtos acabados
Extintor 36: ABC 6KG - Produtos acabados
Extintor 37: ABC 6KG - Produtos acabados
Extintor 38: ABC 6KG - Área de circulação
Extintor 39: ABC 6KG - Produtos acabados
Extintor 40: ABC 6KG - Produtos acabados
Extintor 41: ABC 6KG - Produtos acabados
Extintor 42: ABC 6KG - Produtos acabados
Extintor 43: ABC 6KG - Produtos acabados
Extintor 44: ABC 6KG - Área de circulação
Extintor 45: ABC 6KG - Armazém embalagens
Extintor 46: ABC 6KG - Armazém embalagens
Extintor 47: ABC 6KG - Armazém embalagens
Extintor 48: ABC 6KG - Área ext. Operações
Extintor 49: ABC 6KG - Área ext. Operações
Extintor 50: ABC 6KG - Docas
Extintor 51: CO2 6KG - Moega
Extintor 52: ABC 6KG - Moega
Extintor 53: ABC 6KG - Moega
Extintor 54: ABC 6KG - Moega
Extintor 55: ABC 6KG - Moega
Extintor 56: ABC 6KG - Moega
Extintor 57: ABC 6KG - Docas
Extintor 58: ABC 6KG - Moega
Extintor 59: CO2 6KG - Docas e esteiras
Extintor 60: ABC 6KG - Docas e esteiras
Extintor 61: ABC 6KG - Docas e esteiras
Extintor 62: ABC 6KG - Área vermelha
Extintor 63: CO2 6KG - Área vermelha
Extintor 64: ABC 6KG - Área vermelha externa
Extintor 65: C02 6KG - Caldeira
Extintor 66: 10A80BC - Caldeira
Extintor 67: ABC 6KG - Área vermelha
Extintor 68: CO2 6KG - Área vermelha
Extintor 69: ABC 6KG - Área vermelha
Extintor 70: CO2 6KG - Área vermelha
Extintor 71: ABC 6KG - Caldeira
Extintor 72: ABC 6KG - Área vermelha
Extintor 73: CO2 6KG - Área vermelha
Extintor 74: ABC 6KG - Área vermelha
Extintor 75: ABC 6KG - Intermediário
Extintor 76: ABC 6KG - Intermediário
Extintor 77: ABC 6KG - Intermediário
Extintor 78: 10A80BC - Intermediário
Extintor 79: C02 6KG - Intermediário
Extintor 80: ABC 6KG - Intermediário
Extintor 81: ABC 6KG - Intermediário
Extintor 82: ABC 6KG - Intermediário
Extintor 83: CO2 6KG - Robozinho
Extintor 84: ABC 6KG - Robozinho
Extintor 85: CO2 6KG - Robozinho
Extintor 86: ABC 6KG - Robozinho
Extintor 87: CO2 6KG - Intermediário
Extintor 88: ABC 6KG - Intermediário
Extintor 89: ABC 6KG - Embalagem Room
Extintor 90: ABC 6KG - Intermediário
Extintor 91: ABC 6KG: Intermediário
Extintor 92: ABC 6KG: Área de refinos
Extintor 93: CO2 6KG - Área de refinos
Extintor 94: ABC 6KG - Área branca
Extintor 95: CO2 6KG - Área branca
Extintor 96: ABC 6KG - Área branca
Extintor 97: CO2 6KG - Área branca
Extintor 98: BC 50KG - Área branca
Extintor 99: CO2 6KG - Área branca
Extintor 100: CO2 6KG - Caldeira
Extintor 101: ABC 6KG - Caldeira
Extintor 102: 10A80BC - Caldeira
Extintor 103: ABC 6KG - Caldeira
Extintor 104: CO2 6KG - Caldeira
Extintor 105: ABC 6KG - Caldeira
Extintor 106: ABC 6KG - Caldeira
Extintor 107: ABC 6KG - Compressores
Extintor 108: CO2 6KG - Área branca
Extintor 109: ABC 6KG - Área branca
Extintor 110: ABC 6KG - Área branca
Extintor 111: CO2 6KG - Área branca
Extintor 112: ABC 6KG - Sala de compressores
Extintor 113: ABC 6KG - Caldeira
Extintor 114: CO2 6KG - Caldeira
Extintor 115: ABC 6KG - Caldeira
Extintor 116: ABC 6KG - Área branca
Extintor 117: CO2 4KG - Área branca
Extintor 118: CO2 6KG - Área branca
Extintor 119: ABC 6KG - Área branca
Extintor 120: ABC 6KG - Área de pó
Extintor 121: CO2 6KG - Área de pó
Extintor 122: CO2 6KG - Área de pó
Extintor 123: ABC 6KG - Área de pó
Extintor 124: ABC 6KG - Área de pó
Extintor 125: CO2 6KG - Área de pó
Extintor 126: ABC 6KG - Próx. Casa de bombas
Extintor 127: ABC 6KG - Splitao
Extintor 128: ABC 6KG - Próx. Casa de bombas
Extintor 129: ABC 6KG - Sanitização - interno
Extintor 130: ABC 6KG - Próx. Casa de bombas
Extintor 131: ABC 6KG - Substação - próx. Torre refr.
Extintor 132: CO2 6KG - Substação próx. Torre refr.
Extintor 133: 4A80BC - Substação próx. Torre refr.
Extintor 134: ABC 6KG - Fundo Substação
Extintor 135: CO2 6KG - Tanque área tratada - fundos
Extintor 136: ABC 6KG - Tanque área tratada - fundos
Extintor 137: CO2 6KG - Casa de bombas
Extintor 138: ABC 6KG - Casa de bombas
Extintor 139: ABC 6KG - Lado sala terceiros
Extintor 140: ABC 6KG - Brigada
Extintor 141: ABC 6KG - Próx. Ponto enc. Brigada
Extintor 142: ABC 6KG - Armazém prod. Químico
Extintor 143: ABC 6KG - Armazém prod. Químico
Extintor 144: ABC 6KG - Próx. Armazém prod. Químico
Extintor 145: ABC 6KG - Almoxarifado
Extintor 146: ABC 6KG - Almoxarifado
Extintor 147: ABC 6KG - Próx. Oficina - Área ext.
Extintor 148: ABC 6KG - Oficina
Extintor 149: CO2 6KG - Oficina de manut.
Extintor 150: ABC 6KG - Fundo Almoxarifado
Extintor 151: ABC 6KG - Próx. Oficina - Área ext.
Extintor 152: ABC 6KG - Entrada auditório
Extintor 153: ABC 6KG - Entrada auditório
Extintor 154: ABC 6KG - Fundo Almoxarifado
Extintor 155: ABC 6KG - Caldeiraria
Extintor 156: BC 6KG - Caldeiraria
Extintor 157: ABC 6KG - Caldeiraria
Extintor 158: CO2 6KG - Caldeiraria
Extintor 159: BC 6KG - Caldeiraria
Extintor 160: BC 6KG - Caldeiraria
Extintor 161: ABC 6KG - Próx. Oficina - Terceiros
Extintor 162: ABC 6KG - Conteinner ATMA
Extintor 163: ABC 6KG - Conteinner ATMA
Extintor 164: ABC 6KG - EDP
Extintor 165: ABC 6KG - Conteinner 2S
Extintor 166: ABC 6KG - Conteinner GR
Extintor 167: CO2 6KG - Óleo lubrificante
Extintor 168: ABC 30KG - Óleo lubrificante
Extintor 169: CO2 6KG - Óleo lubrificante
Extintor 170: EM 10L - Óleo lubrificante
Extintor 171: EM 10L - Óleo lubrificante
Extintor 172: EM 10L - Óleo lubrificante
Extintor 173: EM 10L - Óleo lubrificante
Extintor 174: BC 6KG - Próx. Resíduos lâmpadas
Extintor 175: BC 6KG - Próx. Resíduos lâmpadas
Extintor 176: BC 6KG - GLP
Extintor 177: BC 6KG - GLP
Extintor 178: ABC 6KG - Reciclagem
Extintor 179: ABC 6KG - Reciclagem
Extintor 180: ABC 6KG- Estoque material
Extintor 181: ABC 6KG - Estoque material
Extintor 182: ABC 6KG - Varredura resíduos cacau
Extintor 183: ABC 6KG - Varredura resíduos cacau
Extintor 184: ABC 6KG - Resíduos cacau - interno
Extintor 185: ABC 6KG - Frente Conteinner Luc
Extintor 186: ABC 6KG - Frente Conteinner Luc
Extintor 187: ABC 6KG - Garagem Barry - área ext.
Extintor 188: ABC 6KG - Garagem Barry - área ext.
Extintor 189: ABC 6KG - Desmet Pav. 1
Extintor 190: ABC 6KG - Desmet Pav. 1
Extintor 191: ABC 6KG - Desmet Pav. 2
Extintor 192: ABC 6KG - Desmet Pav. 2
Extintor 193: ABC 6KG - Desmet Pav. 3
Extintor 194: ABC 6KG - Desmet Pav. 3
Extintor 195: ABC 6KG - Desmet Pav. 4
Extintor 196: ABC 6KG - Desmet Pav. 4
Extintor 197: ABC 6KG - Grantz 1 Pav.
Extintor 198: ABC 6KG - Grantz 1 Pav.
Extintor 199: ABC 6KG - Grantz 2 Pav.
Extintor 200: ABC 6KG - Grantz 2 Pav.
`;

function parseLine(line) {
  // "Extintor NN: <rest>"
  const m = line.match(/Extintor\s*0*(\d{1,4})\s*:\s*(.+)$/i);
  if (!m) return null;
  const numero = parseInt(m[1], 10);
  let resto = m[2].trim();

  // Split tipo from setor on the FIRST " - " OR ": " separator.
  let tipoRaw, setor;
  const sep = resto.search(/\s-\s|:\s/);
  if (sep >= 0) {
    const sepLen = resto.slice(sep).startsWith(" - ") ? 3 : 2;
    tipoRaw = resto.slice(0, sep).trim();
    setor   = resto.slice(sep + sepLen).trim();
  } else if (/-/.test(resto)) {           // glued "6KG- Estoque"
    const i = resto.indexOf("-");
    tipoRaw = resto.slice(0, i).trim();
    setor   = resto.slice(i + 1).trim();
  } else {
    tipoRaw = resto; setor = "";
  }

  // Normalise tipo: fix C02→CO2, uppercase, KG lowercase, collapse spaces.
  let tipo = tipoRaw.replace(/\s+/g, " ").trim().toUpperCase()
    .replace(/^C02/, "CO2")
    .replace(/\bC02\b/g, "CO2")
    .replace(/\s*KG/g, "kg")
    .replace(/(\d)\s+kg/g, "$1kg");
  setor = setor.replace(/\s{2,}/g, " ").replace(/\.+$/, "").trim();
  return { numero, tipo, setor };
}

const rows = RAW.split("\n").map(l=>l.trim()).filter(Boolean).map(parseLine).filter(Boolean);
function esc(s){ return s.replace(/'/g,"''"); }

let out = `-- =============================================================================
-- MIGRATION 0019: Ilhéus data (extintores 1-200; region total is 300)
-- Sets tipo_carga + setor per pre-seeded slot. Idempotent.
-- =============================================================================
-- ${rows.length} extintores Ilhéus (${rows[0].numero}-${rows[rows.length-1].numero})
`;
out += rows.map(r =>
  `UPDATE extintores SET tipo_carga='${esc(r.tipo)}', setor='${esc(r.setor)}' WHERE regiao='Ilhéus' AND numero_int=${r.numero};`
).join("\n");
console.log(out);

const nums = rows.map(r=>r.numero);
const missing=[]; for(let i=1;i<=200;i++) if(!nums.includes(i)) missing.push(i);
console.error(`rows=${rows.length}, missing 1-200: ${missing.length?missing.join(","):"none"}`);
console.error("distinct tipos:", [...new Set(rows.map(r=>r.tipo))].join(" | "));
