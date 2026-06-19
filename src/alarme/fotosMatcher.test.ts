import { describe, it, expect } from "vitest";
import {
  resolverDispositivo, extrairTipo, pareceEndereco, normalizarEndereco,
  type DispositivoCandidato,
} from "./fotosMatcher";

const SIRENE_TORREF: DispositivoCandidato = {
  id: "s1", central_id: "c3", central_numero: 3, laco: 1, endereco: "L1.05",
  tipo_dispositivo: "sirene", setor: "Torrefação",
};
const ACION_TORREF: DispositivoCandidato = {
  id: "a1", central_id: "c3", central_numero: 3, laco: 1, endereco: "L1.06",
  tipo_dispositivo: "acionador", setor: "Torrefação",
};
const SIRENE_MOAGEM: DispositivoCandidato = {
  id: "s2", central_id: "c3", central_numero: 3, laco: 2, endereco: null,
  tipo_dispositivo: "sirene", setor: "Moagem",
};

const POOL = [SIRENE_TORREF, ACION_TORREF, SIRENE_MOAGEM];

describe("fotosMatcher helpers", () => {
  it("recognises address-shaped identifiers", () => {
    expect(pareceEndereco("L1.05")).toBe(true);
    expect(pareceEndereco("1-05")).toBe(true);
    expect(pareceEndereco("Torrefação sirene")).toBe(false);
  });

  it("normalises addresses to a canonical form", () => {
    expect(normalizarEndereco("L1.05")).toBe("1.05");
    expect(normalizarEndereco("1-05")).toBe("1.05");
    expect(normalizarEndereco("l1/05")).toBe("1.05");
  });

  it("extracts the canonical device type from keywords (accent-insensitive)", () => {
    expect(extrairTipo("Torrefação sirene")).toBe("sirene");
    expect(extrairTipo("detector de fumaça")).toBe("detector_fumaca");
    expect(extrairTipo("botoeira da catraca")).toBe("acionador");
    expect(extrairTipo("apenas um setor")).toBeNull();
  });
});

describe("resolverDispositivo", () => {
  it("matches a single device by address", () => {
    const r = resolverDispositivo("L1.05", POOL);
    expect(r.tipo).toBe("unico");
    if (r.tipo === "unico") expect(r.dispositivo.id).toBe("s1");
  });

  it("matches by setor + tipo when no address is given", () => {
    const r = resolverDispositivo("Torrefação sirene", POOL);
    expect(r.tipo).toBe("unico");
    if (r.tipo === "unico") expect(r.dispositivo.id).toBe("s1");
  });

  it("is accent/case-insensitive on the sector", () => {
    const r = resolverDispositivo("torrefacao sirene", POOL);
    expect(r.tipo).toBe("unico");
    if (r.tipo === "unico") expect(r.dispositivo.id).toBe("s1");
  });

  it("reports ambiguity when a setor has two device types and only the setor is given", () => {
    const r = resolverDispositivo("Torrefação", POOL);
    expect(r.tipo).toBe("ambiguo");
    if (r.tipo === "ambiguo") expect(r.candidatos.map((c) => c.id).sort()).toEqual(["a1", "s1"]);
  });

  it("returns nenhum when nothing matches", () => {
    const r = resolverDispositivo("Caldeira sirene", POOL);
    expect(r.tipo).toBe("nenhum");
  });

  it("falls back to setor+tipo when an address-looking id has no address match", () => {
    // "9.99" looks like an address but matches no endereco → no result here
    const r = resolverDispositivo("9.99", POOL);
    expect(r.tipo).toBe("nenhum");
  });
});
