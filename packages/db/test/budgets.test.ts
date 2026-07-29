import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { seedCategories, findCategoryByName } from "../src/repository/categories";
import { createBudget, listBudgetsForUser, listBudgetsForSpace, updateBudget, deleteBudget, getBudgetStatus } from "../src/repository/budgets";
import { insertTransactions } from "../src/repository/transactions";
import { spaceMembers } from "../src/schema";

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

  it("status pessoal soma so o proprio usuario; status do espaco soma todos", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await bootstrapUser(t.db, { whatsappNumber: "111", name: "A" });
    const b = await bootstrapUser(t.db, { whatsappNumber: "222", name: "B" });
    await seedCategories(t.db, a.space.id);
    await t.db.insert(spaceMembers).values({ spaceId: a.space.id, userId: b.user.id, role: "member" });
    const alim = await findCategoryByName(t.db, a.space.id, "alimentacao", "despesa");
    await insertTransactions(t.db, [
      { createdBy: a.user.id, type: "despesa", amount: "100.00", categoryId: alim!.id, occurredAt: "2026-07-10", source: "texto" },
      { createdBy: b.user.id, type: "despesa", amount: "40.00", categoryId: alim!.id, occurredAt: "2026-07-11", source: "texto" },
    ]);

    const pessoal = await createBudget(t.db, { categoryId: alim!.id, amount: "200.00", scope: "user", userId: a.user.id });
    const doEspaco = await createBudget(t.db, { categoryId: alim!.id, amount: "200.00", scope: "space", spaceId: a.space.id });

    const sp = await getBudgetStatus(t.db, pessoal, "2026-07-01", "2026-07-31");
    expect(sp.spent).toBe("100.00");
    expect(sp.ratio).toBeCloseTo(0.5);

    const ss = await getBudgetStatus(t.db, doEspaco, "2026-07-01", "2026-07-31");
    expect(ss.spent).toBe("140.00");
    expect(ss.ratio).toBeCloseTo(0.7);
  });
});
