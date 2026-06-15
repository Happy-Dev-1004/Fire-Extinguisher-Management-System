// Parses the per-region extinguisher lists (format "NN- TIPO - SETOR") into
// idempotent UPDATE SQL for tipo_carga + setor. Handles types:
// ABC/BC/CO2 (+capacity like 06KG/12KG/20KG), and PREMIUM.

const DATA = {
  "Viveiro Itabuna": `
01- ABC 06KG - Guarita 01
02- ABC 06KG - Manutenção.
03- ABC 06KG - Almoxarifado
04- ABC 06KG - ADM
05- ABC 06KG - Estoque Fertilizante
06- ABC 06KG - Estoque Fertilizante
07- ABC 06KG - Casa de Bombas
08- ABC 06KG - Banheiros
09- ABC 06KG - Tanque
10- ABC 06KG - Viveiro 01
11- ABC 06KG - Guarita 02
12- ABC 06KG - Guarita Saída
`,
  "Viveiro Ilhéus": `
01- Premium - Área externa escritório
02- ABC 06KG - casa fundos próximo mirante
03- PREMIUM - entrada galpão adubo externo
04- PREMIUM - escritório área interna
05- PREMIUM - Galpão adubo entrada externa
06- PREMIUM - Galpão adubo entrada interno
07- PREMIUM - Galpão adubo externo lateral
08- PREMIUM - Galpão adubo interno fundos
09- PREMIUM - Galpão adubo interno lateral
10- PREMIUM - Galpão adubo lateral interno
11- PREMIUM - Galpão fertilizantes interno
12- PREMIUM - Galpão fertilizantes interno
13- PREMIUM - Guarita
14- ABC 06KG - Mirante parte debaixo
15- ABC 06KG - Mirante parte de cima
16- PREMIUM - Oficina 1
17- PREMIUM - Oficina 2
`,
  "CW Ilhéus": `
01- PREMIUM - área externa
02- BC 12KG - área externa
03- BC 12KG - área externa
04- PREMIUM - área externa
05- PREMIUM - área externa
06- CO2 06KG - área externa
07- CO2 06KG - área externa
08- PREMIUM - área depósito
09- PREMIUM - área depósito
10- PREMIUM - área depósito
11- PREMIUM - área depósito
12- PREMIUM - área depósito
13- PREMIUM - área depósito
14- PREMIUM - área depósito
15- PREMIUM - área depósito
16- PREMIUM - área depósito
17- CO2 06kg - área depósito
18- PREMIUM - área depósito
19- ABC 20KG - área depósito
20- PREMIUM - área depósito
21- PREMIUM - área depósito
22- PREMIUM - área depósito
23- PREMIUM - área depósito
24- PREMIUM - área depósito
25- PREMIUM - área depósito
26- PREMIUM - área depósito
27- PREMIUM - área depósito
28- PREMIUM - área depósito
29- PREMIUM - área depósito
30- PREMIUM - área depósito
31- ABC 20KG - área depósito
32- PREMIUM - área depósito
33- CO2 06KG - área depósito
34- PREMIUM - área depósito
35- ABC 20KG - área depósito
36- ABC 20KG - área depósito
37- ABC 20KG - área depósito
38- PREMIUM - área depósito
39- ABC 20KG - área depósito
40- ABC 20KG - área depósito
41- ABC 20KG - área depósito
42- ABC 20KG - área depósito
43- PREMIUM - Área depósito
44- ABC 20KG - área depósito
45- PREMIUM - área depósito
46- ABC 20KG - área depósito
47- PREMIUM - área depósito
48- ABC 20KG - Área depósito
49- PREMIUM - área depósito
50- ABC 20KG - área depósito
51- BC 12KG - área externa
52- BC 12 KG - área externa
`,
  "CW Itabuna": `
01- ABC 06KG - Guarita
02- ABC 06KG - Banheiro Externo
03- ABC 06KG - Área externa
04- ABC 06KG - ADM
05- ABC 06KG- ADM 1 ANDAR
06- ABC 06KG - Recepção
07- PREMIUM - área depósito
08- PREMIUM - área depósito
09- PREMIUM - área depósito
10- PREMIUM - área depósito
11- PREMIUM - área depósito
12- PREMIUM - área depósito
13- PREMIUM - área depósito
14- PREMIUM - área depósito
15- PREMIUM - área depósito
16- PREMIUM - área depósito
17- PREMIUM - área depósito
18- PREMIUM - área depósito
19- PREMIUM - area depósito
20- PREMIUM - área depósito
21- PREMIUM - área depósito
22- PREMIUM - área depósito
23- PREMIUM - área depósito
24- PREMIUM - área depósito
25- PREMIUM - área depósito
26- PREMIUM - área depósito
27- PREMIUM - área depósito
28- PREMIUM - área depósito
29- PREMIUM - área depósito
30- PREMIUM - área depósito
31- PREMIUM - área depósito
32- PREMIUM - área depósito
33- PREMIUM - área depósito
34- PREMIUM - área depósito
35- PREMIUM - área depósito
36- ABC 06KG - área depósito
37- PREMIUM - área depósito
38- PREMIUM - área depósito
`,
};

// Each line: "NN- TIPO [CAP] - SETOR"  (the dash separators can vary in spacing).
function parseLine(line) {
  const m = line.match(/^0*(\d{1,4})\s*-\s*(.+)$/);
  if (!m) return null;
  const numero = parseInt(m[1], 10);
  const resto = m[2];

  // Split remainder on the FIRST " - " into tipo and setor.
  const dash = resto.indexOf(" - ");
  let tipoRaw, setor;
  if (dash >= 0) {
    tipoRaw = resto.slice(0, dash).trim();
    setor = resto.slice(dash + 3).trim();
  } else {
    // e.g. "ABC 06KG- ADM 1 ANDAR" — dash glued to tipo
    const m2 = resto.match(/^(.*?KG|PREMIUM|Premium|CO2|ABC|BC|AP)\s*-\s*(.+)$/i);
    if (m2) { tipoRaw = m2[1].trim(); setor = m2[2].trim(); }
    else { tipoRaw = resto.trim(); setor = ""; }
  }

  // Normalise tipo: uppercase, collapse spaces, "KG" lower-case to match Barry style.
  let tipo = tipoRaw.replace(/\s+/g, " ").trim();
  if (/premium/i.test(tipo)) tipo = "Premium";
  else tipo = tipo.toUpperCase().replace(/\s*KG/i, "kg").replace(/(\d)\s+kg/i, "$1kg");

  // trailing period cleanup ("Manutenção.")
  setor = setor.replace(/\.+$/, "").trim();
  return { numero, tipo, setor };
}

function sqlEsc(s){ return s.replace(/'/g, "''"); }

let out = `-- =============================================================================
-- MIGRATION 0016: real data for Viveiro Itabuna, Viveiro Ilhéus, CW Ilhéus, CW Itabuna
-- Sets tipo_carga + setor per pre-seeded slot. Idempotent; only touches the
-- registry attributes (type/sector), not inspection status/photos.
-- =============================================================================
`;
let totals = {};
for (const [regiao, raw] of Object.entries(DATA)) {
  const rows = raw.split("\n").map(l=>l.trim()).filter(Boolean).map(parseLine).filter(Boolean);
  totals[regiao] = rows.length;
  out += `\n-- ${regiao} (${rows.length} extintores)\n`;
  out += rows.map(r =>
    `UPDATE extintores SET tipo_carga='${sqlEsc(r.tipo)}', setor='${sqlEsc(r.setor)}' WHERE regiao='${sqlEsc(regiao)}' AND numero_int=${r.numero};`
  ).join("\n") + "\n";
}
console.log(out);
console.error("Counts per region:", totals);
// sanity samples
for (const [regiao, raw] of Object.entries(DATA)) {
  const rows = raw.split("\n").map(l=>l.trim()).filter(Boolean).map(parseLine).filter(Boolean);
  console.error(regiao, "->", JSON.stringify(rows[0]), "...", JSON.stringify(rows[rows.length-1]));
}
