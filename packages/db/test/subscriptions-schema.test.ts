import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "@ia/db";
import { subscriptions } from "../src/schema";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (close) await close();
});

describe("tabela subscriptions", () => {
  it("guarda os quatro combos de plano com defaults de trial", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551900000001", name: "L" });

    const [row] = await t.db
      .insert(subscriptions)
      .values({ userId: user.id, tier: "individual", aiMode: "nossa", status: "trial" })
      .returning();

    expect(row.tier).toBe("individual");
    expect(row.aiMode).toBe("nossa");
    expect(row.status).toBe("trial");
    expect(row.trialEndsAt).toBeNull();
    expect(row.pastDueSince).toBeNull();
    expect(row.provider).toBeNull();
  });

  it("aceita tier espaco com ai_mode byo", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551900000002", name: "L" });

    await t.db
      .insert(subscriptions)
      .values({ userId: user.id, tier: "espaco", aiMode: "byo", status: "ativo" });

    const rows = await t.db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].tier).toBe("espaco");
    expect(rows[0].aiMode).toBe("byo");
  });

  it("garante no maximo uma assinatura por usuario", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551900000003", name: "L" });

    await t.db.insert(subscriptions).values({ userId: user.id, tier: "individual", aiMode: "nossa", status: "trial" });
    await expect(
      t.db.insert(subscriptions).values({ userId: user.id, tier: "individual", aiMode: "nossa", status: "trial" }),
    ).rejects.toThrow();
  });
});
