import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { seedCategories, findCategoryByName } from "../src/repository/categories";
import { insertTransactions } from "../src/repository/transactions";
import { updateTransaction, deleteTransaction, getLastTransactionForUser } from "../src/repository/transactions";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("transactions mutations", () => {
  it("getLastTransactionForUser retorna a mais recente", async () => {
    const t = await createTestDb(); close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "51", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");
    await insertTransactions(t.db, [
      { createdBy: user.id, type: "despesa", amount: "10.00", categoryId: alim!.id, occurredAt: "2026-07-01", source: "texto" },
      { createdBy: user.id, type: "despesa", amount: "20.00", categoryId: alim!.id, occurredAt: "2026-07-02", source: "texto" },
    ]);
    const last = await getLastTransactionForUser(t.db, user.id);
    expect(last?.amount).toBe("20.00");
  });

  it("updateTransaction altera campos e deleteTransaction remove", async () => {
    const t = await createTestDb(); close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "52", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");
    const transp = await findCategoryByName(t.db, space.id, "transporte", "despesa");
    const [tx] = await insertTransactions(t.db, [
      { createdBy: user.id, type: "despesa", amount: "50.00", categoryId: alim!.id, occurredAt: "2026-07-03", source: "texto" },
    ]);
    const updated = await updateTransaction(t.db, tx.id, { categoryId: transp!.id, amount: "55.00" });
    expect(updated?.categoryId).toBe(transp!.id);
    expect(updated?.amount).toBe("55.00");
    await deleteTransaction(t.db, tx.id);
    expect(await getLastTransactionForUser(t.db, user.id)).toBeUndefined();
  });
});
