import { describe, it, expect } from "vitest";
import { normalizar, variantesTelefone } from "./normalizar";

describe("normalizar", () => {
  it("keeps the last 11 digits", () => {
    expect(normalizar("5573988020347")).toBe("73988020347");
    expect(normalizar("+55 27 99882-0183")).toBe("27998820183");
    expect(normalizar("73988020347")).toBe("73988020347");
  });
  it("throws on too-short input", () => {
    expect(() => normalizar("123")).toThrow();
  });
});

describe("variantesTelefone — 9th-digit tolerance", () => {
  it("an 11-digit mobile yields both with-9 and without-9 forms", () => {
    const v = variantesTelefone("5573988020347"); // DDD 73 + 9 + 88020347
    expect(v).toContain("73988020347"); // with 9
    expect(v).toContain("7388020347");  // without 9
  });

  it("a 10-digit number yields both without-9 and with-9 inserted", () => {
    const v = variantesTelefone("7388020347"); // DDD 73 + 88020347 (no 9)
    expect(v).toContain("7388020347");  // as-is
    expect(v).toContain("73988020347"); // with 9 inserted
  });

  it("the same person messaging with OR without the 9 shares a common variant", () => {
    const com9  = variantesTelefone("5573988020347"); // with 9
    const sem9  = variantesTelefone("557388020347");  // without 9
    // Both must reduce to the same canonical pair, so a lookup matches either.
    expect(com9).toEqual(expect.arrayContaining(["73988020347", "7388020347"]));
    expect(sem9).toEqual(expect.arrayContaining(["73988020347", "7388020347"]));
    const intersecta = com9.some((x) => sem9.includes(x));
    expect(intersecta).toBe(true);
  });

  it("an 8-digit-subscriber number yields both the as-is and 9-inserted forms", () => {
    const v = variantesTelefone("551133334444"); // DDD 11 + 8-digit subscriber
    expect(v).toContain("1133334444");   // as-is (no 9)
    expect(v).toContain("11933334444");  // with 9 inserted
  });

  it("returns [] for invalid input instead of throwing", () => {
    expect(variantesTelefone("12")).toEqual([]);
  });
});
