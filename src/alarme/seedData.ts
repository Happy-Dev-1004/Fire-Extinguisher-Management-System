// =============================================================================
// PHASE 2 — fire-alarm device seed DATA (no logic here, just the inventory).
//
// HOW TO FILL THIS IN LATER (no code changes needed):
//   - Each entry is { central, setor, quantidade } per device type.
//   - To add devices we already know, add/adjust rows in the relevant array.
//   - laço and endereço are NOT set here — they are filled in per-device later
//     via the dashboard/API as the addressing map arrives. The seed creates the
//     devices "awaiting addressing" (endereco/laco = null).
//   - Sections marked PLACEHOLDER (modulos, isoladores, detector per-sector
//     lists) are intentionally empty until the client provides the breakdown —
//     fill the arrays and re-run the seed; it is idempotent.
//
// BOM (bill of materials) expected totals live in expectedBom.ts and drive the
// reconciliation report, so any gap between seeded and expected is always shown.
// =============================================================================

export type CentralNumero = 1 | 2 | 3 | 4;

export interface SeedSetor {
  central: CentralNumero;
  setor: string;
  quantidade: number;
}

// ── Acionadores manuais (manual call points) — per central/sector (KNOWN) ─────
export const ACIONADORES: SeedSetor[] = [
  // Central 1 — Portaria Principal (6)
  { central: 1, setor: "Catraca Portaria",            quantidade: 1 },
  { central: 1, setor: "Corredor ADM",                quantidade: 1 },
  { central: 1, setor: "Lavanderia",                  quantidade: 1 },
  { central: 1, setor: "Sala de Treinamentos",        quantidade: 1 },
  { central: 1, setor: "Chefe/Gerência",              quantidade: 1 },
  { central: 1, setor: "Portaria Logística",          quantidade: 1 },
  // Central 2 — Logística (14)
  { central: 2, setor: "Ampliação Armazém Fase1",     quantidade: 3 },
  { central: 2, setor: "Ampliação Armazém Fase2",     quantidade: 2 },
  { central: 2, setor: "Armazém 1",                   quantidade: 1 },
  { central: 2, setor: "Armazém 2",                   quantidade: 1 },
  { central: 2, setor: "Armazém Paletes",             quantidade: 1 },
  { central: 2, setor: "Circulação",                  quantidade: 2 },
  { central: 2, setor: "Oficina Mecânica",            quantidade: 1 },
  { central: 2, setor: "Escritório Técnico",          quantidade: 1 },
  { central: 2, setor: "Sala Bateria",                quantidade: 1 },
  { central: 2, setor: "Sala Ar Comprimido",          quantidade: 1 },
  // Central 3 — Fábrica (31)
  { central: 3, setor: "Próximo Central Fábrica",     quantidade: 1 },
  { central: 3, setor: "Entrada Trafos",              quantidade: 1 },
  { central: 3, setor: "Separação Cascas Cacau",      quantidade: 2 },
  { central: 3, setor: "Torrefação",                  quantidade: 1 },
  { central: 3, setor: "Área Prensa 2",               quantidade: 2 },
  { central: 3, setor: "Pulverização Fase2",          quantidade: 1 },
  { central: 3, setor: "Pulverização",                quantidade: 1 },
  { central: 3, setor: "Embalagem Manteiga",          quantidade: 1 },
  { central: 3, setor: "Mixer Fradinho/Mixer 1",      quantidade: 1 },
  { central: 3, setor: "Prensa 3",                    quantidade: 1 },
  { central: 3, setor: "Prensa 3,4,5",                quantidade: 2 },
  { central: 3, setor: "Pulverização Linha 3",        quantidade: 3 },
  { central: 3, setor: "Sala Utilidades",             quantidade: 1 },
  { central: 3, setor: "Separação Linha 3",           quantidade: 1 },
  { central: 3, setor: "Torrefação 2",                quantidade: 2 },
  { central: 3, setor: "Moagem 2",                    quantidade: 3 },
  { central: 3, setor: "Laboratório",                 quantidade: 2 },
  { central: 3, setor: "Paletização",                 quantidade: 5 },
  // Central 4 — Caldeira (4)
  { central: 4, setor: "Caldeira",                    quantidade: 4 },
];

// ── Sirenes (sounders) — per central/sector (KNOWN) ───────────────────────────
export const SIRENES: SeedSetor[] = [
  // Central 1 — Portaria (6)
  { central: 1, setor: "Catraca Portaria",            quantidade: 1 },
  { central: 1, setor: "Corredor ADM",                quantidade: 1 },
  { central: 1, setor: "Lavanderia",                  quantidade: 1 },
  { central: 1, setor: "Sala de Treinamentos",        quantidade: 1 },
  { central: 1, setor: "Chefe/Gerência",              quantidade: 1 },
  { central: 1, setor: "Portaria Logística",          quantidade: 1 },
  // Central 2 — Logística (15)
  { central: 2, setor: "Ampliação Armazém Fase1",     quantidade: 3 },
  { central: 2, setor: "Ampliação Armazém Fase2",     quantidade: 2 },
  { central: 2, setor: "Armazém 1",                   quantidade: 1 },
  { central: 2, setor: "Armazém 2",                   quantidade: 1 },
  { central: 2, setor: "Armazém Paletes",             quantidade: 1 },
  { central: 2, setor: "Circulação",                  quantidade: 2 },
  { central: 2, setor: "Oficina Mecânica",            quantidade: 2 }, // 1 acionador / 2 sirenes
  { central: 2, setor: "Escritório Técnico",          quantidade: 1 },
  { central: 2, setor: "Sala Bateria",                quantidade: 1 },
  { central: 2, setor: "Sala Ar Comprimido",          quantidade: 1 },
  // Central 3 — Fábrica (31)
  { central: 3, setor: "Próximo Central Fábrica",     quantidade: 1 },
  { central: 3, setor: "Entrada Trafos",              quantidade: 1 },
  { central: 3, setor: "Separação Cascas Cacau",      quantidade: 2 },
  { central: 3, setor: "Torrefação",                  quantidade: 1 },
  { central: 3, setor: "Área Prensa 2",               quantidade: 2 },
  { central: 3, setor: "Pulverização Fase2",          quantidade: 1 },
  { central: 3, setor: "Pulverização",                quantidade: 1 },
  { central: 3, setor: "Embalagem Manteiga",          quantidade: 1 },
  { central: 3, setor: "Mixer Fradinho/Mixer 1",      quantidade: 1 },
  { central: 3, setor: "Prensa 3",                    quantidade: 1 },
  { central: 3, setor: "Prensa 3,4,5",                quantidade: 2 },
  { central: 3, setor: "Pulverização Linha 3",        quantidade: 3 },
  { central: 3, setor: "Sala Utilidades",             quantidade: 1 },
  { central: 3, setor: "Separação Linha 3",           quantidade: 1 },
  { central: 3, setor: "Torrefação 2",                quantidade: 2 },
  { central: 3, setor: "Moagem 2",                    quantidade: 3 },
  { central: 3, setor: "Laboratório",                 quantidade: 2 },
  { central: 3, setor: "Paletização",                 quantidade: 5 },
  // Central 4 — Caldeira (4)
  { central: 4, setor: "Caldeira",                    quantidade: 4 },
];

// ── Detectores — per-sector lists (PLACEHOLDER: fill when provided) ───────────
// Expected BOM: 264 fumaça, 32 linear, 14 temperatura. Paste the per-sector
// breakdown into these arrays (same shape). Until filled, reconciliation will
// correctly show the full gap (e.g. "detector_fumaca: 0 de 264 — faltam 264").
export const DETECTORES_FUMACA: SeedSetor[] = [
  // TODO: { central, setor, quantidade } per sector — total should reach 264.
];
export const DETECTORES_LINEAR: SeedSetor[] = [
  // TODO: total should reach 32.
];
export const DETECTORES_TEMPERATURA: SeedSetor[] = [
  // TODO: total should reach 14.
];

// ── Módulos de supervisão (PLACEHOLDER: 64 expected, not yet provided) ────────
export const MODULOS_SUPERVISAO: SeedSetor[] = [
  // TODO: total should reach 64.
];

// ── Isoladores (PLACEHOLDER: 30 expected, not yet provided) ───────────────────
export const ISOLADORES: SeedSetor[] = [
  // TODO: total should reach 30.
];

// Maps a seed array to its device type for the seeder.
export const SEED_GRUPOS: { tipo: string; dados: SeedSetor[] }[] = [
  { tipo: "acionador",            dados: ACIONADORES },
  { tipo: "sirene",               dados: SIRENES },
  { tipo: "detector_fumaca",      dados: DETECTORES_FUMACA },
  { tipo: "detector_linear",      dados: DETECTORES_LINEAR },
  { tipo: "detector_temperatura", dados: DETECTORES_TEMPERATURA },
  { tipo: "modulo_supervisao",    dados: MODULOS_SUPERVISAO },
  { tipo: "isolador",             dados: ISOLADORES },
];
