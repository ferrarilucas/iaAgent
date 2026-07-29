import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { seedCategories, findCategoryByName, DEFAULT_CATEGORIES, listCategoriesForSpace } from "../src/repository/categories";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("categories repository", () => {
  it("seed cria as categorias padrao no espaco", async () => {
    const t = await createTestDb();
    close = t.close;
    const { space } = await bootstrapUser(t.db, { whatsappNumber: "551188", name: "Ana" });

    await seedCategories(t.db, space.id);

    const alimentacao = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");
    expect(alimentacao).toBeDefined();
    const salario = await findCategoryByName(t.db, space.id, "salario", "receita");
    expect(salario).toBeDefined();
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("findCategoryByName respeita o tipo", async () => {
    const t = await createTestDb();
    close = t.close;
    const { space } = await bootstrapUser(t.db, { whatsappNumber: "551177", name: "Ana" });
    await seedCategories(t.db, space.id);
    const asReceita = await findCategoryByName(t.db, space.id, "alimentacao", "receita");
    expect(asReceita).toBeUndefined();
  });

  it("lista as categorias do espaco com id, nome e tipo", async () => {
    const t = await createTestDb(); close = t.close;
    const { space } = await bootstrapUser(t.db, { whatsappNumber: "5599", name: "L" });
    await seedCategories(t.db, space.id);
    const cats = await listCategoriesForSpace(t.db, space.id);
    const nomes = cats.map((c) => c.name);
    expect(nomes).toContain("alimentacao");
    expect(cats.every((c) => c.id && (c.type === "despesa" || c.type === "receita"))).toBe(true);
  });
});
