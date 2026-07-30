import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser, seedCategories, findCategoryByName } from "@ia/db";
import { insertTransactions } from "../src/repository/transactions";
import { createBudget, getBudgetAlerts } from "../src/repository/budgets";
import { spaceMembers } from "../src/schema";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (close) await close();
});

const ym = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const dia1 = `${ym}-01`;

describe("getBudgetAlerts", () => {
  it("diferencia pessoal e espaco e classifica o status pelo ciclo", async () => {
    const t = await createTestDb();
    close = t.close;
    const a = await bootstrapUser(t.db, { whatsappNumber: "aa", name: "A" });
    const b = await bootstrapUser(t.db, { whatsappNumber: "bb", name: "B" });
    await seedCategories(t.db, a.space.id);
    await t.db.insert(spaceMembers).values({ spaceId: a.space.id, userId: b.user.id, role: "member" });
    const alim = await findCategoryByName(t.db, a.space.id, "alimentacao", "despesa");
    const transp = await findCategoryByName(t.db, a.space.id, "transporte", "despesa");

    await insertTransactions(t.db, [
      { createdBy: a.user.id, type: "despesa", amount: "450.00", categoryId: alim!.id, occurredAt: dia1, source: "texto" },
      { createdBy: b.user.id, type: "despesa", amount: "300.00", categoryId: alim!.id, occurredAt: dia1, source: "texto" },
    ]);

    await createBudget(t.db, { categoryId: alim!.id, amount: "500.00", scope: "user", userId: a.user.id, referenceDay: 1 });
    await createBudget(t.db, { categoryId: alim!.id, amount: "500.00", scope: "space", spaceId: a.space.id, referenceDay: 1 });
    await createBudget(t.db, { categoryId: transp!.id, amount: "200.00", scope: "user", userId: a.user.id, referenceDay: 1 });

    const todos = await getBudgetAlerts(t.db, { userId: a.user.id, spaceId: a.space.id });
    const pAlim = todos.find((x) => x.escopo === "pessoal" && x.categoria === "alimentacao");
    const eAlim = todos.find((x) => x.escopo === "espaco" && x.categoria === "alimentacao");
    const pTransp = todos.find((x) => x.escopo === "pessoal" && x.categoria === "transporte");

    expect(pAlim).toMatchObject({ gasto: "450.00", teto: "500.00", percentual: 90, status: "alerta" });
    expect(eAlim).toMatchObject({ gasto: "750.00", teto: "500.00", percentual: 150, status: "estourado" });
    expect(pTransp).toMatchObject({ gasto: "0.00", percentual: 0, status: "ok" });
  });

  it("filtra por categoria quando categoryIds e passado", async () => {
    const t = await createTestDb();
    close = t.close;
    const a = await bootstrapUser(t.db, { whatsappNumber: "cc", name: "A" });
    await seedCategories(t.db, a.space.id);
    const alim = await findCategoryByName(t.db, a.space.id, "alimentacao", "despesa");
    const transp = await findCategoryByName(t.db, a.space.id, "transporte", "despesa");
    await createBudget(t.db, { categoryId: alim!.id, amount: "500.00", scope: "user", userId: a.user.id });
    await createBudget(t.db, { categoryId: transp!.id, amount: "200.00", scope: "user", userId: a.user.id });

    const so = await getBudgetAlerts(t.db, { userId: a.user.id, spaceId: a.space.id, categoryIds: [alim!.id] });
    expect(so).toHaveLength(1);
    expect(so[0].categoria).toBe("alimentacao");
  });
});
