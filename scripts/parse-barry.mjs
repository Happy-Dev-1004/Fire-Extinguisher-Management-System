// Parses the Barry Itabuna extinguisher list (numbers 192–276) into
// { numero, tipo_carga, setor } rows and emits idempotent UPDATE SQL.
//
// Each line looks like:  "Extintor:192 AP área externa resíduos Nestle"
// The number follows "Extintor:" (tolerating "Extintor :", "Exterior:", spaces).
// After the number, the TIPO/CARGA is the leading type token, optionally with a
// capacity ("ABC 8kg", "CO2 10kg", "BC 6kg", "AP", "CO2", "ABC"); everything
// after that is the SETOR.

const RAW = `
Extintor:192 AP área externa resíduos Nestle
Extintor:193 CO2 área externa resíduos Nestle
Extintor:194 AP vestiário terceiros
Extintor 195 ABC 8kg vestiário terceiros
Extintor:196 AP vestiário terceiros Nestle
Extintor:197 ABC 8kg vestiário terceiros Nestle
Extintor:198 ABC 6kg próximo estoque GRSA
Extintor:199 AP próximo estoque GRSA
Extintor:200 AP próximo sala de jogos Nestle
Extintor:201 AP entrada do refeitório
Extintor:202 CO2 entrada do refeitório
Extintor:203 AP em frente auditório
Extintor:204 CO2 em frente auditório
Extintor:205 CO2 auditório
Extintor:206 CO2 ADM Nestle
Extintor:207 CO2 ADM Nestle
Extintor:208 CO2 ADM Nestle
Extintor:209 BC 6kg ADM Nestle
Extintor:210 CO2 ADM Nestle
Extintor:211 ABC 6kg guarita Nestle
Extintor:212 CO2 substação Nestle
Extintor: 213 AP sala de comando caldeira biomassa Nestle
Extintor:214 CO2 sala de comando caldeira biomassa Nestle
Extintor:215 AP sala de comando caldeira biomassa Nestle
Extintor:216 CO2 sala de painéis Nestle
Extintor:217 AP próximo sala controle caldeira Nestle
Extintor:218 AP próximo sala controle caldeira Nestle
Extintor:219 AP Nestle produto acabado
Extintor:220 ABC 8kg Nestle produto acabado
Extintor:221 ABC 8kg Nestle produto acabado
Extintor: 222 AP Nestle produto acabado
Extintor:223 AP Nestle produto acabado
Extintor:224 ABC 4kg Nestle produto acabado
Extintor:225 AP Nestle produto acabado
Extintor:226 CO2 Nestle produto acabado
Extintor:227 AP Nestle produto acabado
Extintor:228 ABC 6kg Nestle produto acabado
Extintor:229 BC 6kg Nestle produto acabado
Extintor:230 ABC 8kg Nestle produto acabado
Extintor:231 ABC 6kg Nestle produto acabado
Extintor:232 AP Nestle produto acabado
Extintor:233 AP Nestle produto acabado
Extintor:234 AP Nestle produto acabado
Extintor:235 ABC 6kg Nestle produto acabado
Extintor:236 AP Nestle produto acabado
Extintor:237 AP Nestle produto acabado
Extintor:238 AP Nestle produto acabado
Extintor:239 ABC 6kg Nestle produto acabado
Extintor:240 AP Nestle produto acabado
Extintor :241 AP Nestle produto acabado
Extintor:242 ABC 6kg Nestle produto acabado
Extintor:243 ABC 8kg Nestle produto acabado
Extintor:244 AP Nestle produto acabado
Extintor:245 ABC 8kg Nestle produto acabado
Extintor:246 AP Nestle produto acabado
Extintor:247 AP Nestle produto acabado
Extintor:248 ABC 6kg Nestle produto acabado
Extintor:249 AP Nestle produto acabado
Extintor:250 CO2 Nestle produto acabado
Extintor:251 AP Nestle produto acabado
Extintor:252 ABC 6kg Nestle produto acabado
Extintor:253 CO2 Nestle produto acabado
Extintor:254 BC 6kg Nestle produto acabado
Extintor:255 ABC 6kg Nestle produto acabado
Extintor:256 CO2 Nestle produto acabado
Exterior:257 AP docas Nestle
Extintor:258 ABC 6kg docas Nestle
Extintor:259 BC 6kg docas Nestle
Extintor:260 ABC 8kg docas Nestle
Extintor:261 AP área externa fundo Nestle
Extintor :262 AP tanque desativado Nestle
Extintor:263 BC 6kg tanque desativado Nestle
Extintor:264 ABC 6kg tanque desativado Nestle
Extintor:265 ABC 8kg tanque desativado Nestle
Extintor:266 BC 6kg GLP neste
Extintor:267 CO2 GLP Nestle
Extintor:268 CO2 área externa Nestle
Extintor:269 ABC 6kg estoque produto químicos Nestle
Extintor:270 ABC 6kg material inflamável Nestle
Extintor:271 ABC 6kg material inflamável Nestle
Extintor:272 CO2 sala de tintas Nestle
Extintor:273 ABC 6kg refeitório
Extintor:274 CO2 10kg carretinha refeitório
Extintor:275 BC 8kg sala de ar comprimido
Extintor:276 CO2 casa de bombas
`;

// type token: ABC / CO2 / AP / BC  (+ optional capacity like "8kg","10kg","6kg","4kg")
const TIPO_RE = /^(ABC|CO2|AP|BC)(\s*\d+\s*kg)?/i;

function parseLine(line) {
  const m = line.match(/(\d{2,4})\s+(.*)$/); // first number, then the rest
  if (!m) return null;
  const numero = parseInt(m[1], 10);
  let resto = m[2].trim();

  const tm = resto.match(TIPO_RE);
  let tipo_carga = "";
  if (tm) {
    tipo_carga = tm[0].replace(/\s+/g, " ").toUpperCase().replace("KG", "kg").trim();
    resto = resto.slice(tm[0].length).trim();
  }
  const setor = resto.trim();
  return { numero, tipo_carga, setor };
}

const rows = RAW.split("\n").map(l => l.trim()).filter(Boolean).map(parseLine).filter(Boolean);

function sqlEsc(s) { return s.replace(/'/g, "''"); }

// Emit one UPDATE per slot — idempotent, only sets tipo_carga + setor on the
// Barry Itabuna slot with that number.
const updates = rows.map(r =>
  `UPDATE extintores SET tipo_carga='${sqlEsc(r.tipo_carga)}', setor='${sqlEsc(r.setor)}' WHERE regiao='Barry Itabuna' AND numero_int=${r.numero};`
).join("\n");

console.log(`-- ${rows.length} extintores Barry Itabuna (${rows[0].numero}–${rows[rows.length-1].numero})`);
console.log(updates);
console.error(`Parsed ${rows.length} rows. Sample:`);
console.error(rows.slice(0, 3));
console.error(rows.slice(-2));
