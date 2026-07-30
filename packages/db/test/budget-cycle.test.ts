import { describe, it, expect, vi, afterEach } from "vitest";
import { budgetCycleRange } from "../src/repository/budgets";

function fakeToday(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${iso}T12:00:00-03:00`));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("budgetCycleRange", () => {
  it("comeca no dia de referencia do mes corrente quando hoje ja passou dele", () => {
    fakeToday("2026-07-20");
    expect(budgetCycleRange(5)).toEqual({ from: "2026-07-05", to: "2026-07-20" });
  });

  it("volta pro mes anterior quando hoje ainda nao chegou no dia", () => {
    fakeToday("2026-07-03");
    expect(budgetCycleRange(5)).toEqual({ from: "2026-06-05", to: "2026-07-03" });
  });

  it("no proprio dia de referencia o ciclo comeca hoje", () => {
    fakeToday("2026-07-05");
    expect(budgetCycleRange(5)).toEqual({ from: "2026-07-05", to: "2026-07-05" });
  });

  it("vira o ano ao voltar de janeiro", () => {
    fakeToday("2026-01-02");
    expect(budgetCycleRange(10)).toEqual({ from: "2025-12-10", to: "2026-01-02" });
  });

  it("dia 1 equivale ao mes cheio ate hoje", () => {
    fakeToday("2026-07-18");
    expect(budgetCycleRange(1)).toEqual({ from: "2026-07-01", to: "2026-07-18" });
  });

  it("clampa dias fora de 1-28", () => {
    fakeToday("2026-07-18");
    expect(budgetCycleRange(31)).toEqual({ from: "2026-06-28", to: "2026-07-18" });
    expect(budgetCycleRange(0)).toEqual({ from: "2026-07-01", to: "2026-07-18" });
  });
});
