import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import { budgets, transactions } from "../schema";
import type { Budget } from "../types";
import { getSpaceMemberUserIds } from "./users";

export async function createBudget(
  db: Db,
  input: { categoryId: string; amount: string; scope: "user" | "space"; userId?: string; spaceId?: string },
): Promise<Budget> {
  const [row] = await db
    .insert(budgets)
    .values({
      categoryId: input.categoryId,
      amount: input.amount,
      scope: input.scope,
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

export async function updateBudget(db: Db, id: string, patch: { amount: string }): Promise<Budget | undefined> {
  const [row] = await db.update(budgets).set({ amount: patch.amount }).where(eq(budgets.id, id)).returning();
  return row;
}

export async function deleteBudget(db: Db, id: string): Promise<void> {
  await db.delete(budgets).where(eq(budgets.id, id));
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
