import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "../../../packages/db/test/helpers";
import { bootstrapUser, seedCategories, findCategoryByName, createBudget } from "@ia/db";
import { insertTransactions } from "../../../packages/db/src/repository/transactions";
import { spaceMembers } from "../../../packages/db/src/schema";
import { pushSpaceBudgetAlerts } from "../src/agent/space-alerts";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (close) await close();
});

const ym = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const dia1 = `${ym}-01`;

describe("pushSpaceBudgetAlerts", () => {
  it("avisa so os outros membros e nao repete dentro da semana", async () => {
    const t = await createTestDb();
    close = t.close;
    const autor = await bootstrapUser(t.db, { whatsappNumber: "5511111", name: "Autor" });
    const outro = await bootstrapUser(t.db, { whatsappNumber: "5522222", name: "Outro" });
    await seedCategories(t.db, autor.space.id);
    await t.db.insert(spaceMembers).values({ spaceId: autor.space.id, userId: outro.user.id, role: "member" });
    const alim = await findCategoryByName(t.db, autor.space.id, "alimentacao", "despesa");

    await insertTransactions(t.db, [
      { createdBy: autor.user.id, type: "despesa", amount: "600.00", categoryId: alim!.id, occurredAt: dia1, source: "texto" },
    ]);
    await createBudget(t.db, { categoryId: alim!.id, amount: "500.00", scope: "space", spaceId: autor.space.id, referenceDay: 1 });

    const enviados: Array<{ to: string; text: string }> = [];
    const sendText = async (to: string, text: string) => {
      enviados.push({ to, text });
    };

    await pushSpaceBudgetAlerts({ db: t.db, spaceId: autor.space.id, authorUserId: autor.user.id, sendText });

    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe("5522222");
    expect(enviados[0].text).toContain("alimentacao");
    expect(enviados[0].text).toContain("passou do limite");

    await pushSpaceBudgetAlerts({ db: t.db, spaceId: autor.space.id, authorUserId: autor.user.id, sendText });
    expect(enviados).toHaveLength(1);
  });

  it("nao avisa quando o limite do espaco esta ok", async () => {
    const t = await createTestDb();
    close = t.close;
    const autor = await bootstrapUser(t.db, { whatsappNumber: "5533333", name: "Autor" });
    const outro = await bootstrapUser(t.db, { whatsappNumber: "5544444", name: "Outro" });
    await seedCategories(t.db, autor.space.id);
    await t.db.insert(spaceMembers).values({ spaceId: autor.space.id, userId: outro.user.id, role: "member" });
    const alim = await findCategoryByName(t.db, autor.space.id, "alimentacao", "despesa");
    await insertTransactions(t.db, [
      { createdBy: autor.user.id, type: "despesa", amount: "100.00", categoryId: alim!.id, occurredAt: dia1, source: "texto" },
    ]);
    await createBudget(t.db, { categoryId: alim!.id, amount: "500.00", scope: "space", spaceId: autor.space.id, referenceDay: 1 });

    const enviados: string[] = [];
    await pushSpaceBudgetAlerts({
      db: t.db,
      spaceId: autor.space.id,
      authorUserId: autor.user.id,
      sendText: async (to) => {
        enviados.push(to);
      },
    });
    expect(enviados).toHaveLength(0);
  });
});
