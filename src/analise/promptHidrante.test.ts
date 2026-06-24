import { describe, it, expect } from "vitest";
import { buildUserMessageHidrante } from "./promptHidrante";

function texto(msg: ReturnType<typeof buildUserMessageHidrante>): string {
  const first = msg[0];
  return first.type === "text" ? first.text : "";
}

describe("buildUserMessageHidrante — expected-counts verification block", () => {
  it("includes the registered accessory counts (plural) and the verify instruction", () => {
    const t = texto(buildUserMessageHidrante("H01", ["u1"], { esguicho: "2", mangueira: "4", chave_storz: "2" }));
    expect(t).toContain("esperado 2 esguichos");
    expect(t).toContain("esperado 4 mangueiras");
    expect(t).toContain("esperado 2 chaves Storz");
    // It must tell the model to VERIFY against the count, not identify blind.
    expect(t).toContain("VERIFIQUE");
    expect(t).toMatch(/menos do que o esperado.*"PENDENTE"/is);
    expect(t).toMatch(/não conseguir ver.*"Indeterminado"/is);
  });

  it("uses the singular noun when the expected count is 1", () => {
    const t = texto(buildUserMessageHidrante("H11-1", ["u1"], { esguicho: "1", mangueira: "2", chave_storz: "2" }));
    expect(t).toContain("esperado 1 esguicho");      // singular
    expect(t).not.toContain("esperado 1 esguichos");
    expect(t).toContain("esperado 2 mangueiras");    // plural
  });

  it("omits the expectation block entirely when no constants are registered", () => {
    const semNada = texto(buildUserMessageHidrante("H01", ["u1"]));
    expect(semNada).not.toContain("esperado");
    expect(semNada).not.toContain("ESTE hidrante TEM");

    const vazio = texto(buildUserMessageHidrante("H01", ["u1"], { esguicho: "", mangueira: null }));
    expect(vazio).not.toContain("esperado");
  });

  it("still warns that small accessories are easy to confuse (Indeterminado over OK)", () => {
    const t = texto(buildUserMessageHidrante("H01", ["u1"]));
    expect(t).toContain("Indeterminado");
    expect(t.toLowerCase()).toContain("difíceis de distinguir");
  });

  it("attaches every image at high detail after the text part", () => {
    const msg = buildUserMessageHidrante("H01", ["u1", "u2"], { esguicho: "2" });
    expect(msg).toHaveLength(3); // 1 text + 2 images
    expect(msg[1]).toEqual({ type: "image_url", image_url: { url: "u1", detail: "high" } });
    expect(msg[2]).toEqual({ type: "image_url", image_url: { url: "u2", detail: "high" } });
  });
});
