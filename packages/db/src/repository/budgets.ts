import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { budgets } from "../schema";
import type { Budget } from "../types";

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
