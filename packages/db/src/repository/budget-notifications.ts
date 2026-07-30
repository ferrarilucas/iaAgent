import { sql } from "drizzle-orm";
import type { Db } from "../client";
import { budgetAlertNotifications } from "../schema";

export async function claimBudgetAlertNotification(
  db: Db,
  input: { userId: string; categoryId: string; scope: string },
): Promise<boolean> {
  const rows = await db
    .insert(budgetAlertNotifications)
    .values({ userId: input.userId, categoryId: input.categoryId, scope: input.scope })
    .onConflictDoUpdate({
      target: [budgetAlertNotifications.userId, budgetAlertNotifications.categoryId, budgetAlertNotifications.scope],
      set: { sentAt: sql`now()` },
      setWhere: sql`${budgetAlertNotifications.sentAt} < now() - interval '7 days'`,
    })
    .returning({ id: budgetAlertNotifications.id });
  return rows.length > 0;
}
