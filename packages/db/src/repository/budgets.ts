import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import { budgets, transactions } from "../schema";
import type { Budget } from "../types";
import { getSpaceMemberUserIds } from "./users";
import { listCategoriesForSpace } from "./categories";

export const BUDGET_ALERT_THRESHOLD = 0.8;

export type BudgetAlert = {
  budgetId: string;
  categoryId: string;
  categoria: string;
  escopo: "pessoal" | "espaco";
  gasto: string;
  teto: string;
  ratio: number;
  percentual: number;
  diaFechamento: number;
  cicloDesde: string;
  status: "ok" | "alerta" | "estourado";
};

export function budgetCycleRange(referenceDay: number, tz = "America/Sao_Paulo"): { from: string; to: string } {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const [y, m, d] = today.split("-").map(Number);
  const day = Math.min(Math.max(referenceDay || 1, 1), 28);
  let fromYear = y;
  let fromMonth = m;
  if (d < day) {
    fromMonth -= 1;
    if (fromMonth === 0) {
      fromMonth = 12;
      fromYear -= 1;
    }
  }
  const from = `${fromYear}-${String(fromMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { from, to: today };
}

export async function createBudget(
  db: Db,
  input: { categoryId: string; amount: string; scope: "user" | "space"; referenceDay?: number; userId?: string; spaceId?: string },
): Promise<Budget> {
  const [row] = await db
    .insert(budgets)
    .values({
      categoryId: input.categoryId,
      amount: input.amount,
      scope: input.scope,
      referenceDay: input.referenceDay ?? 1,
      userId: input.userId ?? null,
      spaceId: input.spaceId ?? null,
    })
    .returning();
  return row;
}

export async function listBudgetsForUser(db: Db, userId: string): Promise<Budget[]> {
  return db.select().from(budgets).where(and(eq(budgets.scope, "user"), eq(budgets.userId, userId)));
}

export async function listBudgetsForSpace(db: Db, spaceId: string): Promise<Budget[]> {
  return db.select().from(budgets).where(and(eq(budgets.scope, "space"), eq(budgets.spaceId, spaceId)));
}

export async function updateBudget(
  db: Db,
  id: string,
  patch: { amount?: string; referenceDay?: number },
): Promise<Budget | undefined> {
  const set: { amount?: string; referenceDay?: number } = {};
  if (patch.amount !== undefined) set.amount = patch.amount;
  if (patch.referenceDay !== undefined) set.referenceDay = patch.referenceDay;
  const [row] = await db.update(budgets).set(set).where(eq(budgets.id, id)).returning();
  return row;
}

export async function deleteBudget(db: Db, id: string): Promise<void> {
  await db.delete(budgets).where(eq(budgets.id, id));
}

export async function getBudgetAlerts(
  db: Db,
  input: { userId: string; spaceId: string; categoryIds?: string[] },
): Promise<BudgetAlert[]> {
  const [pessoais, doEspaco, cats] = await Promise.all([
    listBudgetsForUser(db, input.userId),
    listBudgetsForSpace(db, input.spaceId),
    listCategoriesForSpace(db, input.spaceId),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const filtro = input.categoryIds ? new Set(input.categoryIds) : null;
  const selecionados = [...pessoais, ...doEspaco].filter((b) => !filtro || filtro.has(b.categoryId));
  const alertas: BudgetAlert[] = [];
  for (const b of selecionados) {
    const ciclo = budgetCycleRange(b.referenceDay);
    const st = await getBudgetStatus(db, b, ciclo.from, ciclo.to);
    const status = st.ratio >= 1 ? "estourado" : st.ratio >= BUDGET_ALERT_THRESHOLD ? "alerta" : "ok";
    alertas.push({
      budgetId: b.id,
      categoryId: b.categoryId,
      categoria: catName.get(b.categoryId) ?? "outros",
      escopo: b.scope === "user" ? "pessoal" : "espaco",
      gasto: st.spent,
      teto: st.limit,
      ratio: st.ratio,
      percentual: Math.round(st.ratio * 100),
      diaFechamento: b.referenceDay,
      cicloDesde: ciclo.from,
      status,
    });
  }
  return alertas;
}

export async function getBudgetStatus(
  db: Db,
  budget: Budget,
  from: string,
  to: string,
): Promise<{ limit: string; spent: string; ratio: number }> {
  let creators: string[];
  if (budget.scope === "user") {
    creators = budget.userId ? [budget.userId] : [];
  } else {
    creators = budget.spaceId ? await getSpaceMemberUserIds(db, budget.spaceId) : [];
  }
  let spent = "0.00";
  if (creators.length > 0) {
    const rows = await db
      .select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          inArray(transactions.createdBy, creators),
          eq(transactions.categoryId, budget.categoryId),
          eq(transactions.type, "despesa"),
          gte(transactions.occurredAt, from),
          lte(transactions.occurredAt, to),
        ),
      );
    spent = Number(rows[0]?.total ?? 0).toFixed(2);
  }
  const limitNum = Number(budget.amount);
  const ratio = limitNum > 0 ? Number(spent) / limitNum : 0;
  return { limit: budget.amount, spent, ratio };
}
