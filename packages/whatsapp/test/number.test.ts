import { describe, it, expect } from "vitest";
import { normalizeBrazilNumber } from "../src/number";

describe("normalizeBrazilNumber", () => {
  const canonical = "5551999892403";

  it("mantem numero ja canonico (55 + ddd + 9 digitos)", () => {
    expect(normalizeBrazilNumber("5551999892403")).toBe(canonical);
  });

  it("insere o nono digito quando falta com codigo de pais", () => {
    expect(normalizeBrazilNumber("555199892403")).toBe(canonical);
  });

  it("adiciona 55 quando vem so ddd + 9 digitos", () => {
    expect(normalizeBrazilNumber("51999892403")).toBe(canonical);
  });

  it("adiciona 55 e o nono digito quando vem ddd + 8 digitos", () => {
    expect(normalizeBrazilNumber("5199892403")).toBe(canonical);
  });

  it("ignora formatacao (parenteses, traco, espaco, +)", () => {
    expect(normalizeBrazilNumber("+55 (51) 99989-2403")).toBe(canonical);
    expect(normalizeBrazilNumber("(51) 9989-2403")).toBe(canonical);
  });

  it("nao confunde ddd 55 com codigo de pais", () => {
    expect(normalizeBrazilNumber("5599998888")).toBe("5555999998888");
    expect(normalizeBrazilNumber("55999998888")).toBe("5555999998888");
  });

  it("devolve digitos crus quando nao reconhece o formato", () => {
    expect(normalizeBrazilNumber("123")).toBe("123");
  });
});
