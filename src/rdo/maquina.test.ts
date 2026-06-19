import { describe, it, expect, beforeEach } from "vitest";
import { processarRdo, type Deps, type Sessao } from "./maquina";
import { PERGUNTAS } from "./perguntas";

// ── In-memory fake Deps — a full simulation of the session + RDO store + IO ───
function makeFake() {
  const sessoes = new Map<string, Sessao>();
  const rdos = new Map<string, any>();
  const enviadas: Record<string, string[]> = {}; // phone -> messages sent
  let rdoSeq = 0, fotoSeq = 0;

  const deps: Deps = {
    async getSessao(tel) { return sessoes.get(tel) ?? null; },
    async criarSessao(tel, rdoId) {
      const s: Sessao = { telefone_normalizado: tel, rdo_id: rdoId, etapa: 0, ultima_msg_id: null, aguardando_fotos: false };
      sessoes.set(tel, s); return s;
    },
    async atualizarSessao(tel, patch) {
      const s = sessoes.get(tel); if (s) sessoes.set(tel, { ...s, ...patch });
    },
    async apagarSessao(tel) { sessoes.delete(tel); },
    async criarRdo(tel) {
      const id = `rdo-${++rdoSeq}`;
      rdos.set(id, { id, telefone_origem: tel, status: "em_andamento", efetivo: {}, equipamentos_uso: {}, atividades: {}, dispositivos_instalados: {}, atrasos: {}, fotos_dia: [] });
      return id;
    },
    async setCampoRdo(rdoId, destino, valor) {
      const r = rdos.get(rdoId);
      if (destino.coluna) r[destino.coluna] = valor;
      else if (destino.jsonb && destino.chave) { r[destino.jsonb] = r[destino.jsonb] ?? {}; r[destino.jsonb][destino.chave] = valor; }
    },
    async anexarFotoRdo(rdoId, url) { rdos.get(rdoId).fotos_dia.push(url); },
    async finalizarRdo(rdoId) { const r = rdos.get(rdoId); r.status = "concluido"; return r; },
    async cancelarRdo(rdoId) { rdos.get(rdoId).status = "cancelado"; },
    async enviar(tel, texto) { (enviadas[tel] ??= []).push(texto); },
    async subirFoto(_rdoId, _url, _suffix) { return `https://storage/foto-${++fotoSeq}.jpg`; },
    hojeISO() { return "2026-06-18"; },
  };

  return { deps, sessoes, rdos, enviadas };
}

// Answer that satisfies each question type, for happy-path walking.
function respostaPara(key: string): string {
  const p = PERGUNTAS.find((x) => x.key === key)!;
  switch (p.tipo) {
    case "numero":  return "2";
    case "data":    return "18/06/2026";
    case "sim_nao": return "sim";
    case "opcao":   return "1";
    case "texto":   return "Resposta de teste";
    case "fotos":   return "pronto";
  }
}

const PHONE = "73988020347";

describe("RDO state machine", () => {
  let fake: ReturnType<typeof makeFake>;
  beforeEach(() => { fake = makeFake(); });

  it("trigger 'RDO' starts a session and asks the first question", async () => {
    const handled = await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "RDO", messageId: "m0" });
    expect(handled).toBe(true);
    expect(fake.sessoes.has(PHONE)).toBe(true);
    const msgs = fake.enviadas[PHONE];
    expect(msgs.some((m) => m.includes("RDO iniciado"))).toBe(true);
    expect(msgs[msgs.length - 1]).toBe(PERGUNTAS[0].pergunta);
  });

  it("a non-trigger message with NO session is NOT consumed (webhook continues)", async () => {
    const handled = await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "57", messageId: "x" });
    expect(handled).toBe(false);
    expect(fake.sessoes.has(PHONE)).toBe(false);
  });

  it("HAPPY PATH: a full session produces a complete, concluido RDO", async () => {
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "RDO", messageId: "start" });
    let i = 0;
    for (const p of PERGUNTAS) {
      await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: respostaPara(p.key), messageId: `msg-${i++}` });
    }
    // session cleared, exactly one RDO, concluido, with all fields
    expect(fake.sessoes.has(PHONE)).toBe(false);
    const rdo = [...fake.rdos.values()][0];
    expect(rdo.status).toBe("concluido");
    expect(rdo.data).toBe("2026-06-18");
    expect(rdo.responsavel).toBe("Resposta de teste");
    expect(rdo.periodo).toBe("diurno");
    expect(rdo.efetivo.eletricistas).toBe(2);
    expect(rdo.dispositivos_instalados.detector_fumaca).toBe(2);
    expect(rdo.integracao_novos).toBe(true);
    const fim = fake.enviadas[PHONE].at(-1)!;
    expect(fim).toContain("RDO concluído");
  });

  it("invalid numeric answer is RE-ASKED and does not advance", async () => {
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "RDO", messageId: "s" });
    // walk to the first numero question (ef_eletricistas)
    const idxNum = PERGUNTAS.findIndex((p) => p.tipo === "numero");
    for (let i = 0; i < idxNum; i++) {
      await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: respostaPara(PERGUNTAS[i].key), messageId: `a${i}` });
    }
    const etapaAntes = fake.sessoes.get(PHONE)!.etapa;
    // send garbage to the numero question
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "muitos", messageId: "bad" });
    expect(fake.sessoes.get(PHONE)!.etapa).toBe(etapaAntes); // did NOT advance
    expect(fake.enviadas[PHONE].at(-1)).toContain("número");
    // now a valid number advances
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "5", messageId: "good" });
    expect(fake.sessoes.get(PHONE)!.etapa).toBe(etapaAntes + 1);
  });

  it("'cancelar' aborts cleanly (session removed, RDO marked cancelado)", async () => {
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "RDO", messageId: "s" });
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "cancelar", messageId: "c" });
    expect(fake.sessoes.has(PHONE)).toBe(false);
    expect([...fake.rdos.values()][0].status).toBe("cancelado");
    expect(fake.enviadas[PHONE].at(-1)).toContain("cancelado");
  });

  it("'voltar' returns to the previous question", async () => {
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "RDO", messageId: "s" });
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "18/06/2026", messageId: "a0" }); // etapa 0 -> 1
    expect(fake.sessoes.get(PHONE)!.etapa).toBe(1);
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "voltar", messageId: "b" });
    expect(fake.sessoes.get(PHONE)!.etapa).toBe(0);
    expect(fake.enviadas[PHONE].at(-1)).toBe(PERGUNTAS[0].pergunta);
  });

  it("TWO phones run independent sessions without cross-contamination", async () => {
    const A = "73900000001", B = "27900000002";
    await processarRdo(fake.deps, { telefone_normalizado: A, texto: "RDO", messageId: "a-s" });
    await processarRdo(fake.deps, { telefone_normalizado: B, texto: "RDO", messageId: "b-s" });
    // A answers two questions; B answers one
    await processarRdo(fake.deps, { telefone_normalizado: A, texto: "18/06/2026", messageId: "a1" });
    await processarRdo(fake.deps, { telefone_normalizado: A, texto: "Maria",      messageId: "a2" });
    await processarRdo(fake.deps, { telefone_normalizado: B, texto: "01/01/2026", messageId: "b1" });

    expect(fake.sessoes.get(A)!.etapa).toBe(2);
    expect(fake.sessoes.get(B)!.etapa).toBe(1);
    expect(fake.sessoes.get(A)!.rdo_id).not.toBe(fake.sessoes.get(B)!.rdo_id);
    // A's responsavel set, B's not
    const rdoA = fake.rdos.get(fake.sessoes.get(A)!.rdo_id);
    const rdoB = fake.rdos.get(fake.sessoes.get(B)!.rdo_id);
    expect(rdoA.responsavel).toBe("Maria");
    expect(rdoB.responsavel).toBeUndefined();
  });

  it("DUPLICATE inbound message (same messageId) does NOT double-advance", async () => {
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "RDO", messageId: "s" });
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "18/06/2026", messageId: "dup" });
    const etapa = fake.sessoes.get(PHONE)!.etapa; // 1
    // same messageId again — must be ignored
    const handled = await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "18/06/2026", messageId: "dup" });
    expect(handled).toBe(true);
    expect(fake.sessoes.get(PHONE)!.etapa).toBe(etapa); // unchanged
  });

  it("photo step: photos attach to the RDO, then 'pronto' completes", async () => {
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "RDO", messageId: "s" });
    // walk up to the fotos step answering everything before it
    const idxFotos = PERGUNTAS.findIndex((p) => p.tipo === "fotos");
    for (let i = 0; i < idxFotos; i++) {
      await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: respostaPara(PERGUNTAS[i].key), messageId: `q${i}` });
    }
    // send two photos
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, imageUrl: "https://wa/img1.jpg", messageId: "p1" });
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, imageUrl: "https://wa/img2.jpg", messageId: "p2" });
    const rdoId = [...fake.rdos.keys()][0];
    expect(fake.rdos.get(rdoId).fotos_dia.length).toBe(2);
    // 'pronto' finalises
    await processarRdo(fake.deps, { telefone_normalizado: PHONE, texto: "pronto", messageId: "done" });
    expect(fake.rdos.get(rdoId).status).toBe("concluido");
    expect(fake.sessoes.has(PHONE)).toBe(false);
  });
});
