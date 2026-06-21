import { describe, it, expect, beforeEach } from "vitest";
import { processarFotoDispositivo, type Deps, type SessaoFoto } from "./fotosDispositivo";
import type { DispositivoCandidato } from "./fotosMatcher";

// In-memory simulation of the device store + session store + IO.
function makeFake(candidatos: DispositivoCandidato[]) {
  const sessoes = new Map<string, SessaoFoto>();
  const fotosPorDispositivo = new Map<string, string[]>();
  const statusPorDispositivo = new Map<string, string>();
  const pendentes: Array<{ identificador: string | null; foto_url: string; motivo: string }> = [];
  const enviadas: Record<string, string[]> = {};
  let fotoSeq = 0;

  for (const c of candidatos) statusPorDispositivo.set(c.id, "pendente");

  const deps: Deps = {
    async getSessaoFoto(tel) { return sessoes.get(tel) ?? null; },
    async abrirSessaoFoto(tel, centralNumero) {
      const s: SessaoFoto = {
        telefone_normalizado: tel, dispositivo_id: null, central_numero: centralNumero,
        ultimo_identificador: null, ultima_msg_id: null,
      };
      sessoes.set(tel, s); return s;
    },
    async atualizarSessaoFoto(tel, patch) {
      const s = sessoes.get(tel); if (s) sessoes.set(tel, { ...s, ...patch });
    },
    async apagarSessaoFoto(tel) { sessoes.delete(tel); },
    async listarCandidatos(centralNumero) {
      return centralNumero == null ? candidatos : candidatos.filter((c) => c.central_numero === centralNumero);
    },
    async anexarFotoDispositivo(id, url) {
      const arr = fotosPorDispositivo.get(id) ?? [];
      arr.push(url); fotosPorDispositivo.set(id, arr);
      if (statusPorDispositivo.get(id) === "pendente") statusPorDispositivo.set(id, "instalado");
      return { total: arr.length };
    },
    async registrarFotoPendente(input) {
      pendentes.push({ identificador: input.identificador, foto_url: input.foto_url, motivo: input.motivo });
    },
    async enviar(tel, texto) { (enviadas[tel] ??= []).push(texto); },
    async subirFoto(_p, _url, _suffix) { return `https://storage/foto-${++fotoSeq}.jpg`; },
    hojeISO() { return "2026-06-19"; },
  };

  return { deps, sessoes, fotosPorDispositivo, statusPorDispositivo, pendentes, enviadas };
}

const SIRENE: DispositivoCandidato = {
  id: "s1", central_id: "c3", central_numero: 3, laco: 1, endereco: "L1.05",
  tipo_dispositivo: "sirene", setor: "Torrefação",
};
const ACIONADOR: DispositivoCandidato = {
  id: "a1", central_id: "c3", central_numero: 3, laco: 1, endereco: "L1.06",
  tipo_dispositivo: "acionador", setor: "Torrefação",
};

const PHONE = "73988020347";

describe("device-photo WhatsApp flow", () => {
  let fake: ReturnType<typeof makeFake>;
  beforeEach(() => { fake = makeFake([SIRENE, ACIONADOR]); });

  it("'dispositivo' trigger enters the mode", async () => {
    const handled = await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "dispositivo", messageId: "m0" });
    expect(handled).toBe(true);
    expect(fake.sessoes.has(PHONE)).toBe(true);
    expect(fake.enviadas[PHONE].some((m) => m.includes("registro de dispositivo"))).toBe(true);
  });

  it("does NOT consume a normal message when not in device-photo mode", async () => {
    const handled = await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "olá", messageId: "m0" });
    expect(handled).toBe(false);
  });

  it("attaches a photo to the RIGHT device and marks it installed", async () => {
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "dispositivo", messageId: "m0" });
    // name the device (by address)
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "L1.05", messageId: "m1" });
    expect(fake.sessoes.get(PHONE)?.dispositivo_id).toBe("s1");
    // send a photo
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, imageUrl: "https://wa/img1.jpg", messageId: "m2" });

    expect(fake.fotosPorDispositivo.get("s1")?.length).toBe(1);
    expect(fake.fotosPorDispositivo.get("a1")).toBeUndefined(); // not the other device
    expect(fake.statusPorDispositivo.get("s1")).toBe("instalado");
    expect(fake.pendentes.length).toBe(0); // nothing parked
  });

  it("routes a photo to the device named by setor+tipo", async () => {
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "dispositivo", messageId: "m0" });
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "Torrefação acionador", messageId: "m1" });
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, imageUrl: "https://wa/img1.jpg", messageId: "m2" });
    expect(fake.fotosPorDispositivo.get("a1")?.length).toBe(1);
    expect(fake.fotosPorDispositivo.get("s1")).toBeUndefined();
  });

  it("parks an unmatched photo for review — never loses it", async () => {
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "dispositivo", messageId: "m0" });
    // identifier that matches nothing
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "Caldeira sirene", messageId: "m1" });
    expect(fake.sessoes.get(PHONE)?.dispositivo_id).toBeNull();
    // photo sent anyway → goes to review, not attached to any device
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, imageUrl: "https://wa/img1.jpg", messageId: "m2" });

    expect(fake.pendentes.length).toBe(1);
    expect(fake.pendentes[0].identificador).toBe("Caldeira sirene");
    expect(fake.pendentes[0].foto_url).toContain("storage/foto-");
    expect(fake.fotosPorDispositivo.size).toBe(0); // nothing attached
  });

  it("parks a photo sent BEFORE any identifier (still not lost)", async () => {
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "dispositivo", messageId: "m0" });
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, imageUrl: "https://wa/img1.jpg", messageId: "m1" });
    expect(fake.pendentes.length).toBe(1);
    expect(fake.pendentes[0].identificador).toBeNull();
  });

  it("parks a photo sent WITHOUT ever entering 'dispositivo' mode — never dropped", async () => {
    // No "dispositivo" trigger at all (the real-world miss): a photo arrives in
    // the alarm session. It must be consumed (true) and parked, not lost.
    const handled = await processarFotoDispositivo(fake.deps, {
      telefone_normalizado: PHONE, imageUrl: "https://wa/img1.jpg", messageId: "m0",
    });
    expect(handled).toBe(true);
    expect(fake.pendentes.length).toBe(1);
    expect(fake.pendentes[0].foto_url).toContain("storage/foto-");
    expect(fake.fotosPorDispositivo.size).toBe(0);
    expect(fake.enviadas[PHONE].some((m) => m.includes("modo dispositivo") && m.includes("revisão"))).toBe(true);
  });

  it("a plain text message (no photo) without device mode is NOT consumed", async () => {
    const handled = await processarFotoDispositivo(fake.deps, {
      telefone_normalizado: PHONE, texto: "bom dia", messageId: "m0",
    });
    expect(handled).toBe(false); // lets the webhook continue its routing
  });

  it("asks to disambiguate when the identifier matches several devices", async () => {
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "dispositivo", messageId: "m0" });
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "Torrefação", messageId: "m1" });
    expect(fake.sessoes.get(PHONE)?.dispositivo_id).toBeNull();
    expect(fake.enviadas[PHONE].some((m) => m.includes("Encontrei 2 dispositivos"))).toBe(true);
  });

  it("ignores a duplicate delivery (same messageId) — no double attach", async () => {
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "dispositivo", messageId: "m0" });
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "L1.05", messageId: "m1" });
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, imageUrl: "https://wa/img1.jpg", messageId: "m2" });
    // exact same message again
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, imageUrl: "https://wa/img1.jpg", messageId: "m2" });
    expect(fake.fotosPorDispositivo.get("s1")?.length).toBe(1);
  });

  it("'encerrar dispositivo' leaves the mode", async () => {
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "dispositivo", messageId: "m0" });
    await processarFotoDispositivo(fake.deps, { telefone_normalizado: PHONE, texto: "encerrar dispositivo", messageId: "m1" });
    expect(fake.sessoes.has(PHONE)).toBe(false);
  });
});
