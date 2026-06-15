// Parses the FULL Barry Itabuna list (1–276) into idempotent UPDATE SQL.
// Line format: "Extintor:NN TIPO[ CAP] SETOR" (tolerating "Extintor NN",
// "Extintor :NN", "Exterior:NN", and the chat-prefix timestamp line).

const RAW = `
Extintor 01 BC 6kg portaria
Extintor: 02 AP portaria
Extintor:03 BC 6kg portaria
Extintor: 04 CO2 entrada do laboratório microbiologia
Extintor: 05 AP entrada do laboratório microbiologia
Extintor: 06 ABC 6kg corredor do laboratório
Extintor:07 ABC 4kg laboratório
Extintor: 08 CO2 laboratório
Extintor:09 CO2 laboratório
Extintor:10 CO2 4kg patógeno
Extintor:11 ABC 6kg patógeno
Extintor: 12 BC 6kg corredor ADM
Extintor:13 ABC 6kg ADM
Extintor:14 CO2 ADM
Extintor:15 ABC 6kg garagem
Extintor:16 ABC 4kg fundo do  ADM
Extintor:17 CO2 fundo laboratório microbiologia área externa
Extintor:18 CO2 fundo laboratório microbiologia área externa
Extintor :19 ABC 6kg área externa em frente a subestação
Exterior:20 ABC 6kg
Extintor:21 ABC 6kg próximo casa de gás natural
Extintor: 22 ABC 12kg área externa GLP
Extintor:23 BC 6kg área externa escritório armazém de favas
Extintor: 24 AP área externa escritório armazém de favas
Extintor:25 ABC 6kg área externa GLP
Extintor: 26 ABC 6kg fundo da caldeira
Extintor :27 CO2 derretedor
Extintor:28 BC 12kg derretedor
Extintor:29 AP derretedor
Extintor: 30 AP derretedor
Extintor:31 AP derretedor
Extintor:32 ABC 6kg área externa fundo utilidades
Extintor:33 ABC 6kg utilidades
Extintor : 34 CO2 utilidades
Extintor:35 CO2 favas
Extintor:36 AP favas
Extintor:37 AP favas
Extintor: 38 AP favas
Extintor:39 AP favas
Extintor:40 AP favas
Extintor:41 AP favas
Extintor:42 ABC 6kg favas
Extintor :43 ABC 4kg favas
Extintor:44 AP favas
Extintor:45 CO2 favas
Extintor:46 AP favas
Extintor:47 CO2 favas
Extintor:48 ABC 6kg favas
Extintor:49 AP favas
Extintor:50 ABC 4kg favas
Extintor:51 ABC 6kg favas
Extintor:52 ABC 6kg favas
Extintor:53 AP favas
Extintor:54 AP favas
Extintor:55 AP favas
Extintor :56 AP favas
Extintor :57 AP favas
Extintor:58 ABC 6kg favas
Extintor:59 AP favas - 1 andar
Extintor:60 CO2 favas -1 andar
Extintor:61 AP favas - 2 andar
Extintor 62 CO2 favas -2 andar
Extintor:63 CO2 sala de comando
Extintor:64 BC 6kg sala de comando
Extintor:65 AP seleção linha 2 infrared
Extintor:66 AP seleção linha 2 infrared
Extintor:67 BC 6kg seleção linha 2 infrared
Extintor: 68 CO2 seleção linha 2 infrared
Extintor: 69 BC 6kg separação linda 2 piso amarelo
Extintor: 70 CO2 separação linda 2 piso amarelo
Extintor:71 BC 6kg separação linda 2 piso amarelo
Extintor:72 BC 6kg separação cascas cacau
Extintor:73 CO2 separação cascas cacau
Extintor:74 ABC 6kg separação cascas cacau
Extintor:75 CO2 separação cascas cacau
Extintor:76 CO2 separação cascas cacau
Extintor:77 ABC 4kg separação cascas cacau
Extintor:78 ABC 6kg torrefação
Extintor:79 CO2 torrefação
Extintor :80 CO2 sala supervisão
Extintor:81 CO2 sala supervisão
Extintor:82 CO2 substação
Extintor:83 CO2 substação
Extintor:84 ABC 6kg perto da central
Extintor:85 CO2 entrada da fábrica
Extintor:86 CO2 substação térreo
Extintor:87 CO2 área externa circulação fábrica
Extintor:88 ABC 6kg circulação fábrica
Extintor:89 BC 6kg circulação fábrica
Extintor:90 CO2 oficina
Extintor:91 ABC 4kg utilidades linha 1
Extintor:92 CO2 almoxarifado
Extintor:93 BC 6kg almoxarifado
Extintor:94 AP almoxarifado
Extintor :95 ABC 6kg área externa almoxarifado
Extintor:96 BC área externa almoxarifado
Extintor:97 AP área externa almoxarifado
Extintor:98 ABC 12kg área externa GLP
Extintor:99 CO2 produto acabado
Extintor:100 ABC 4kg produto acabado
Extintor:101 CO2 produto acabado
Extintor:102 CO2 produto acabado
Extintor:103 AP produto acabado
Extintor:104 AP produto acabado
Extintor:105 CO2 produto acabado
Extintor:106 ABC 6kg produto acabado
Extintor:107 ABC 6kg produto acabado
Extintor:108 AP produto acabado
Extintor:109 BC área circulação fábrica
Extintor:110 ABC 6kg circulação fábrica
Extintor: 111 ABC 6kg área externa GLP
Extintor:112 ABC 6kg área externa lavatório
Extintor:113 BC 6kg área externa lavatório
Extintor:114 BC 6kg área externa plásticos
Extintor:115 CO2 área externa GLP
Extintor:116 CO2 área externa fundo da brigada
Extintor:117 AP área externa HSE
Extintor:118 ABC 6kg área externa HSE
Extintor:119 ABC 12kg área externa HSE
Extintor:120 ABC 8kg casa de bombas
Extintor:121 ABC 6kg área painel elétrico do silos
Extintor:122 CO2 moinho área branca
Extintor:123 CO2 prensa área branca
Extintor:124 ABC 6kg prensa área branca
Extintor:125 ABC 6kg moagem linha 2
Extintor:126 AP moagem linha 2
Extintor:127 BC 6kg moagem linha 2
Extintor:128 CO2 moagem linha 2
Extintor:129 CO2 moagem linha 2
Extintor:130 BC 6kg moagem linha 2
Extintor:131 CO2 torrefação linha 2
Extintor:132 CO2 torrefação linha 2
Extintor:133 CO2 torrefação linha 2 -1 andar
Extintor:134 CO2 torrefação linha 2
Extintor:135 AP silo dos GDS
Extintor :136 CO2 torrefação linha 2 - 3 andar
Extintor:137 AP torrefação linha 2 - 4 andar
Extintor:138 AP torrefação linha 2 - 5 andar
Extintor:139 AP corredor do laboratório
Extintor:140 ABC 6kg laboratório da fábrica
Extintor:141 ABC 6kg laboratório da fábrica
Extintor:142 AP laboratório da fábrica
Extintor:143 CO2 laboratório da fábrica
Extintor:144 laboratório da fábrica
Extintor:145 AP ADM laboratório
Extintor:146 AP ADM laboratório
Extintor: 147 CO2 ADM laboratório
Extintor:148 CO2 prensas 3
Extintor:149 CO2 prensas 3
Extintor:150 CO2 prensas 4
Extintor:151 CO2 prensas 4
Extintor:152 CO2 prensas 3
Extintor:153 CO2 sala de painéis das prensas
Extintor:154 ABC 6kg embalagem fibra de manteiga
Extintor:155 BC 6kg embalagem de manteiga
Extintor:156 CO2 pulverização linha 2
Extintor:157 AP pulverização linha 2
Extintor:158 ABC 6kg pulverização linha 2
Extintor:159 AP pulverização linha 1
Extintor:160 BC 6kg pulverização linha 1
Extintor:161 AP pulverização linha 1
Extintor:162 AP pulverização linha 1
Extintor:163 AP pulverização linha 1
Extintor:164 AP pulverização linha 1
Extintor:165 AP pulverização linha 1
Extintor:166 BC 6kg pulverização linha 1
Extintor:167 CO2 pulverização linha 2
Extintor:168 CO2 pulverização linha 2
Extintor:169 CO2 mix
Extintor:170 ABC 6kg mix
Extintor:171 ABC 6kg mix
Extintor:172 ABC 6kg mix
Extintor:173 CO2 mix
Extintor:174 CO2 mix
Extintor:175 ABC 6kg sala compressor
Extintor:176 ABC 6kg pulverização linha 3
Extintor:177 ABC 4kg pulverização linha 3
Extintor:178 ABC 4kg pulverização linha 3
Extintor:179 ABC 4 kg pulverização linha 3
Extintor:180 ABC 4kg pulverização linha 3
Extintor:181 ABC 4kg pulverização linha 3
Extintor:182 ABC 6kg pulverização linha 3
Extintor:183 ABC 6kg pulverização linha 3
Extintor:184 CO2 substação produtos acabados
Extintor:185 ABC 6kg substação produtos acabados
Extintor:186 AP pulverização linha 3 -1 andar
Extintor:187 AP pulverização linha 3 - 2 andar
Extintor:188 ABC 6kg pulverização linha 3 -2 andar
Extintor:189 AP pulverização linha 3 -2 andar
Extintor:190 ABC 6kg pulverização linha 3 -2 andar
Extintor:191 ABC 6kg pulverização linha 3 -3 andar
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

// tipo token: ABC/CO2/AP/BC (+ optional capacity "6kg","12kg","4 kg", etc.)
const TIPO_RE = /^(ABC|CO2|AP|BC)(\s*\d+\s*kg)?/i;

function parseLine(line) {
  // strip any leading chat prefix like "[08/06, 17:05] Endrew Novais: "
  line = line.replace(/^\[[^\]]*\]\s*[^:]*:\s*/, "");
  const m = line.match(/(\d{1,4})\s+(.*)$/);
  if (!m) return null;
  const numero = parseInt(m[1], 10);
  if (numero < 1 || numero > 276) return null;
  let resto = m[2].trim();
  const tm = resto.match(TIPO_RE);
  let tipo = "";
  if (tm) {
    tipo = tm[0].replace(/\s+/g, " ").toUpperCase().replace(/\s*KG/i, "kg").replace(/(\d)\s+kg/i, "$1kg").trim();
    resto = resto.slice(tm[0].length).trim();
  }
  const setor = resto.replace(/\s{2,}/g, " ").replace(/\.+$/, "").trim();
  return { numero, tipo, setor };
}

const seen = new Map();
RAW.split("\n").map(l=>l.trim()).filter(Boolean).map(parseLine).filter(Boolean)
  .forEach(r => seen.set(r.numero, r));   // dedupe: last occurrence wins (192-276 repeated)

const rows = [...seen.values()].sort((a,b)=>a.numero-b.numero);
function esc(s){ return s.replace(/'/g,"''"); }

let out = `-- =============================================================================
-- MIGRATION 0017: Barry Itabuna full data (extintores 1-276)
-- Sets tipo_carga + setor for every Barry Itabuna slot. Idempotent.
-- =============================================================================
-- ${rows.length} extintores Barry Itabuna (${rows[0].numero}-${rows[rows.length-1].numero})
`;
out += rows.map(r =>
  `UPDATE extintores SET tipo_carga='${esc(r.tipo)}', setor='${esc(r.setor)}' WHERE regiao='Barry Itabuna' AND numero_int=${r.numero};`
).join("\n");
console.log(out);

// gaps check
const nums = rows.map(r=>r.numero);
const missing=[]; for(let i=1;i<=276;i++) if(!nums.includes(i)) missing.push(i);
console.error(`rows=${rows.length}, missing numbers: ${missing.length?missing.join(","):"none"}`);
console.error("no-tipo rows:", rows.filter(r=>!r.tipo).map(r=>r.numero));
