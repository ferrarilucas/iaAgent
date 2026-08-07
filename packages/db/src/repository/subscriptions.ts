import type { Subscription } from "../types";

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
