import { and, eq, gte, lte, inArray, sql, desc } from "drizzle-orm";
import type { Db } from "../client";
import { transactions } from "../schema";
import type { Transaction } from "../types";
import { getSpaceMemberUserIds } from "./users";

export type TransactionInput = {
  createdBy: string;
  type: "despesa" | "receita";
  amount: string;
  categoryId?: string;
  description?: string;
  occurredAt: string;
  source: "texto" | "audio" | "foto" | "video" | "pdf";
};

export async function insertTransactions(db: Db, inputs: TransactionInput[]): Promise<Transaction[]> {
  if (inputs.length === 0) return [];
  return db
    .insert(transactions)
    .values(
      inputs.map((i) => ({
        createdBy: i.createdBy,
        type: i.type,
        amount: i.amount,
        categoryId: i.categoryId ?? null,
        description: i.description ?? null,
        occurredAt: i.occurredAt,
        source: i.source,
      })),
    )
    .returning();
}

export async function listTransactionsForSpace(
  db: Db,
  spaceId: string,
  filters: { from?: string; to?: string; type?: "despesa" | "receita" } = {},
): Promise<Transaction[]> {
  const ids = await getSpaceMemberUserIds(db, spaceId);
  if (ids.length === 0) return [];
  const conds = [inArray(transactions.createdBy, ids)];
  if (filters.from) conds.push(gte(transactions.occurredAt, filters.from));
  if (filters.to) conds.push(lte(transactions.occurredAt, filters.to));
  if (filters.type) conds.push(eq(transactions.type, filters.type));
  return db.select().from(transactions).where(and(...conds));
}

export async function sumByCategory(
  db: Db,
  spaceId: string,
  filters: { from: string; to: string; type: "despesa" | "receita" },
): Promise<Array<{ categoryId: string | null; total: string }>> {
  const ids = await getSpaceMemberUserIds(db, spaceId);
  if (ids.length === 0) return [];
  return db
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.createdBy, ids),
        eq(transactions.type, filters.type),
        gte(transactions.occurredAt, filters.from),
        lte(transactions.occurredAt, filters.to),
      ),
    )
    .groupBy(transactions.categoryId);
}

export async function updateTransaction(
  db: Db,
  id: string,
  patch: Partial<{
    type: "despesa" | "receita";
    amount: string;
    categoryId: string;
    description: string;
    occurredAt: string;
    source: "texto" | "audio" | "foto" | "video" | "pdf";
  }>,
): Promise<Transaction | undefined> {
  const [row] = await db.update(transactions).set(patch).where(eq(transactions.id, id)).returning();
  return row;
}

export async function deleteTransaction(db: Db, id: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.id, id));
}

export async function getLastTransactionForUser(db: Db, userId: string): Promise<Transaction | undefined> {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.createdBy, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  return rows[0];
}
