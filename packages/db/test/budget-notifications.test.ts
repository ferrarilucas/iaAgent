import { describe, it, expect, afterEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { createTestDb } from "./helpers";
import { bootstrapUser, seedCategories, findCategoryByName } from "@ia/db";
import { claimBudgetAlertNotification } from "../src/repository/budget-notifications";
import { budgetAlertNotifications } from "../src/schema";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (close) await close();
});

describe("claimBudgetAlertNotification", () => {
  it("libera uma vez, bloqueia dentro de 7 dias e libera de novo depois", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "51", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");
    const key = { userId: user.id, categoryId: alim!.id, scope: "espaco" };

    expect(await claimBudgetAlertNotification(t.db, key)).toBe(true);
    expect(await claimBudgetAlertNotification(t.db, key)).toBe(false);

    await t.db
      .update(budgetAlertNotifications)
      .set({ sentAt: sql`now() - interval '8 days'` })
      .where(and(eq(budgetAlertNotifications.userId, user.id), eq(budgetAlertNotifications.categoryId, alim!.id)));

    expect(await claimBudgetAlertNotification(t.db, key)).toBe(true);
    expect(await claimBudgetAlertNotification(t.db, key)).toBe(false);
  });

  it("chaves de escopo diferentes nao colidem", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "52", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");

    expect(await claimBudgetAlertNotification(t.db, { userId: user.id, categoryId: alim!.id, scope: "espaco" })).toBe(true);
    expect(await claimBudgetAlertNotification(t.db, { userId: user.id, categoryId: alim!.id, scope: "pessoal" })).toBe(true);
  });
});
