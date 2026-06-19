// Expected bill-of-materials totals per device type. The reconciliation report
// compares what's registered against these so any gap is always visible and
// never silently assumed. Update here if the project scope changes.

export const BOM_ESPERADO: Record<string, number> = {
  detector_fumaca:      264,
  detector_temperatura: 14,
  detector_linear:      32,
  acionador:            65,
  sirene:               65,
  modulo_supervisao:    64,
  isolador:             30,
};

// Friendly pt-BR labels for each device type (UI + reports).
export const TIPO_LABEL: Record<string, string> = {
  detector_fumaca:      "Detector de fumaça",
  detector_temperatura: "Detector de temperatura",
  detector_linear:      "Detector linear",
  acionador:            "Acionador manual",
  sirene:               "Sirene",
  modulo_supervisao:    "Módulo de supervisão",
  isolador:             "Isolador",
  outro:                "Outro",
};
