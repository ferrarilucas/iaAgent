import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { seedCategories, findCategoryByName, DEFAULT_CATEGORIES } from "../src/repository/categories";

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
});
