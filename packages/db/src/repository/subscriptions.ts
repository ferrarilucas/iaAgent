import type { Subscription } from "../types";
import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { subscriptions } from "../schema";

export const TRIAL_DAYS = 7;
export const PAST_DUE_GRACE_DAYS = 3;

export type AccessState = "liberado" | "trial_expirado" | "inadimplente" | "cancelado";

const DIA_MS = 86400000;

export function subscriptionAccess(sub: Subscription, now: Date = new Date()): AccessState {
  if (sub.status === "cancelado") return "cancelado";
  if (sub.status === "ativo") return "liberado";
  if (sub.status === "trial") {
    if (!sub.trialEndsAt) return "trial_expirado";
    return now.getTime() <= sub.trialEndsAt.getTime() ? "liberado" : "trial_expirado";
  }
  if (!sub.pastDueSince) return "inadimplente";
  const limite = sub.pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * DIA_MS;
  return now.getTime() <= limite ? "liberado" : "inadimplente";
}

export async function getSubscriptionForUser(db: Db, userId: string): Promise<Subscription | undefined> {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return rows[0];
}

export async function ensureTrialSubscription(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<Subscription> {
  const existente = await getSubscriptionForUser(db, userId);
  if (existente) return existente;
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DIA_MS);
  const [criada] = await db
    .insert(subscriptions)
    .values({ userId, tier: "individual", aiMode: "nossa", status: "trial", trialEndsAt })
    .onConflictDoNothing({ target: subscriptions.userId })
    .returning();
  if (criada) return criada;
  return (await getSubscriptionForUser(db, userId))!;
}

export async function resolveAccessForUser(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<{ subscription: Subscription; access: AccessState }> {
  const subscription = await ensureTrialSubscription(db, userId, now);
  return { subscription, access: subscriptionAccess(subscription, now) };
}
