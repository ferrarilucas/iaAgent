import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser, getSpaceMemberUserIds } from "../src/repository/users";
import { seedCategories, findCategoryByName } from "../src/repository/categories";
import {
  insertTransactions,
  listTransactionsForSpace,
  sumByCategory,
} from "../src/repository/transactions";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("transactions repository", () => {
  it("insere em lote e lista as transacoes do espaco", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "5511", name: "Lucas" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");

    await insertTransactions(t.db, [
      { createdBy: user.id, type: "despesa", amount: "50.00", categoryId: alim!.id, occurredAt: "2026-07-01", source: "texto" },
      { createdBy: user.id, type: "despesa", amount: "30.50", categoryId: alim!.id, occurredAt: "2026-07-02", source: "audio" },
    ]);

    const list = await listTransactionsForSpace(t.db, space.id);
    expect(list).toHaveLength(2);
    expect(list.map((x) => x.amount).sort()).toEqual(["30.50", "50.00"]);
  });

  it("somatorio por categoria abrange todos os membros do espaco", async () => {
    const t = await createTestDb();
    close = t.close;
    const a = await bootstrapUser(t.db, { whatsappNumber: "111", name: "A" });
    const b = await bootstrapUser(t.db, { whatsappNumber: "222", name: "B" });
    await seedCategories(t.db, a.space.id);
    const alim = await findCategoryByName(t.db, a.space.id, "alimentacao", "despesa");
    await t.db.insert((await import("../src/schema")).spaceMembers).values({ spaceId: a.space.id, userId: b.user.id, role: "member" });

    const members = await getSpaceMemberUserIds(t.db, a.space.id);
    expect(members.sort()).toEqual([a.user.id, b.user.id].sort());

    await insertTransactions(t.db, [
      { createdBy: a.user.id, type: "despesa", amount: "100.00", categoryId: alim!.id, occurredAt: "2026-07-10", source: "texto" },
      { createdBy: b.user.id, type: "despesa", amount: "40.00", categoryId: alim!.id, occurredAt: "2026-07-11", source: "texto" },
    ]);

    const totals = await sumByCategory(t.db, a.space.id, { from: "2026-07-01", to: "2026-07-31", type: "despesa" });
    expect(totals).toHaveLength(1);
    expect(totals[0].total).toBe("140.00");
  });
});
