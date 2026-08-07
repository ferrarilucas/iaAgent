import { describe, it, expect } from "vitest";
import { subscriptionAccess, TRIAL_DAYS, PAST_DUE_GRACE_DAYS } from "../src/repository/subscriptions";
import type { Subscription } from "../src/types";

const base: Subscription = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  tier: "individual",
  aiMode: "nossa",
  status: "trial",
  trialEndsAt: null,
  currentPeriodEnd: null,
  pastDueSince: null,
  provider: null,
  providerCustomerId: null,
  providerSubscriptionId: null,
  createdAt: new Date("2026-08-01T12:00:00Z"),
  updatedAt: new Date("2026-08-01T12:00:00Z"),
};

const dias = (n: number) => new Date(Date.parse("2026-08-01T12:00:00Z") + n * 86400000);

describe("subscriptionAccess", () => {
  it("libera trial dentro do prazo", () => {
    const sub = { ...base, status: "trial" as const, trialEndsAt: dias(TRIAL_DAYS) };
    expect(subscriptionAccess(sub, dias(6))).toBe("liberado");
  });

  it("bloqueia trial vencido", () => {
    const sub = { ...base, status: "trial" as const, trialEndsAt: dias(TRIAL_DAYS) };
    expect(subscriptionAccess(sub, dias(8))).toBe("trial_expirado");
  });

  it("bloqueia trial sem data de fim", () => {
    const sub = { ...base, status: "trial" as const, trialEndsAt: null };
    expect(subscriptionAccess(sub, dias(0))).toBe("trial_expirado");
  });

  it("libera assinatura ativa", () => {
    const sub = { ...base, status: "ativo" as const };
    expect(subscriptionAccess(sub, dias(999))).toBe("liberado");
  });

  it("libera atrasado dentro da tolerancia", () => {
    const sub = { ...base, status: "atrasado" as const, pastDueSince: dias(0) };
    expect(subscriptionAccess(sub, dias(PAST_DUE_GRACE_DAYS - 1))).toBe("liberado");
  });

  it("bloqueia atrasado depois da tolerancia", () => {
    const sub = { ...base, status: "atrasado" as const, pastDueSince: dias(0) };
    expect(subscriptionAccess(sub, dias(PAST_DUE_GRACE_DAYS + 1))).toBe("inadimplente");
  });

  it("bloqueia atrasado sem data de inicio do atraso", () => {
    const sub = { ...base, status: "atrasado" as const, pastDueSince: null };
    expect(subscriptionAccess(sub, dias(0))).toBe("inadimplente");
  });

  it("bloqueia cancelado", () => {
    const sub = { ...base, status: "cancelado" as const };
    expect(subscriptionAccess(sub, dias(0))).toBe("cancelado");
  });
});
