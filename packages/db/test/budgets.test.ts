import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { seedCategories, findCategoryByName } from "../src/repository/categories";
import { createBudget, listBudgetsForUser, listBudgetsForSpace, updateBudget, deleteBudget } from "../src/repository/budgets";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("budgets repository", () => {
  it("cria e lista limite pessoal e de espaco separadamente", async () => {
    const t = await createTestDb(); close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "51", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");

    const pessoal = await createBudget(t.db, { categoryId: alim!.id, amount: "300.00", scope: "user", userId: user.id });
    const doEspaco = await createBudget(t.db, { categoryId: alim!.id, amount: "800.00", scope: "space", spaceId: space.id });

    expect(pessoal.scope).toBe("user");
    expect(doEspaco.scope).toBe("space");
    const meus = await listBudgetsForUser(t.db, user.id);
    expect(meus.map((b) => b.amount)).toEqual(["300.00"]);
    const doSpace = await listBudgetsForSpace(t.db, space.id);
    expect(doSpace.map((b) => b.amount)).toEqual(["800.00"]);
  });

  it("atualiza e apaga", async () => {
    const t = await createTestDb(); close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "52", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");
    const b = await createBudget(t.db, { categoryId: alim!.id, amount: "300.00", scope: "user", userId: user.id });
    const upd = await updateBudget(t.db, b.id, { amount: "350.00" });
    expect(upd?.amount).toBe("350.00");
    await deleteBudget(t.db, b.id);
    expect(await listBudgetsForUser(t.db, user.id)).toHaveLength(0);
  });
});
