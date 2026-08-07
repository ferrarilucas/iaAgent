import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "@ia/db";
import {
  ensureTrialSubscription,
  getSubscriptionForUser,
  resolveAccessForUser,
  TRIAL_DAYS,
} from "../src/repository/subscriptions";
import { subscriptions } from "../src/schema";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (close) await close();
});

const AGORA = new Date("2026-08-01T12:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() + n * 86400000);

describe("ensureTrialSubscription", () => {
  it("cria trial de 7 dias no primeiro contato", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000001", name: "L" });

    const sub = await ensureTrialSubscription(t.db, user.id, AGORA);

    expect(sub.status).toBe("trial");
    expect(sub.tier).toBe("individual");
    expect(sub.aiMode).toBe("nossa");
    expect(sub.trialEndsAt?.getTime()).toBe(dias(TRIAL_DAYS).getTime());
  });

  it("e idempotente: nao cria uma segunda assinatura nem estende o trial", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000002", name: "L" });

    const primeira = await ensureTrialSubscription(t.db, user.id, AGORA);
    const segunda = await ensureTrialSubscription(t.db, user.id, dias(3));

    expect(segunda.id).toBe(primeira.id);
    expect(segunda.trialEndsAt?.getTime()).toBe(primeira.trialEndsAt?.getTime());
    const todas = await t.db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    expect(todas).toHaveLength(1);
  });

  it("nao rebaixa uma assinatura ativa de volta para trial", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000003", name: "L" });
    await ensureTrialSubscription(t.db, user.id, AGORA);
    await t.db.update(subscriptions).set({ status: "ativo" }).where(eq(subscriptions.userId, user.id));

    const sub = await ensureTrialSubscription(t.db, user.id, dias(30));

    expect(sub.status).toBe("ativo");
  });
});

describe("getSubscriptionForUser", () => {
  it("devolve undefined quando o usuario nao tem assinatura", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000004", name: "L" });

    expect(await getSubscriptionForUser(t.db, user.id)).toBeUndefined();
  });
});

describe("resolveAccessForUser", () => {
  it("libera no primeiro contato criando o trial", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000005", name: "L" });

    const r = await resolveAccessForUser(t.db, user.id, AGORA);

    expect(r.access).toBe("liberado");
    expect(r.subscription.status).toBe("trial");
  });

  it("bloqueia depois que o trial vence", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000006", name: "L" });
    await ensureTrialSubscription(t.db, user.id, AGORA);

    const r = await resolveAccessForUser(t.db, user.id, dias(TRIAL_DAYS + 1));

    expect(r.access).toBe("trial_expirado");
  });
});
