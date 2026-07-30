import { describe, it, expect } from "vitest";
import { CATEGORY_NAMES } from "@ia/db";
import { itemSchema } from "../src/agent/tools";

const base = { type: "despesa" as const, amount: "10.00", occurredAt: "2026-07-30", source: "texto" as const };

describe("itemSchema categoria enum", () => {
  it("aceita qualquer categoria do conjunto fixo", () => {
    for (const nome of CATEGORY_NAMES) {
      expect(itemSchema.safeParse({ ...base, categoria: nome }).success).toBe(true);
    }
  });

  it("rejeita categoria inventada fora do conjunto", () => {
    expect(itemSchema.safeParse({ ...base, categoria: "streaming" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...base, categoria: "pets" }).success).toBe(false);
    expect(itemSchema.safeParse({ ...base, categoria: "" }).success).toBe(false);
  });
});
