import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "../client";
import { blockedNumbers } from "../schema";

export type BlockedNumber = {
  whatsappNumber: string;
  reason: string | null;
  blockedAt: Date;
};

export async function isNumberBlocked(db: Db, whatsappNumber: string): Promise<boolean> {
  const rows = await db
    .select({ whatsappNumber: blockedNumbers.whatsappNumber })
    .from(blockedNumbers)
    .where(eq(blockedNumbers.whatsappNumber, whatsappNumber))
    .limit(1);
  return rows.length > 0;
}

export async function blockNumber(db: Db, whatsappNumber: string, reason?: string): Promise<void> {
  await db
    .insert(blockedNumbers)
    .values({ whatsappNumber, reason: reason ?? null })
    .onConflictDoUpdate({
      target: blockedNumbers.whatsappNumber,
      set: { reason: reason ?? null, blockedAt: new Date() },
    });
}

export async function unblockNumber(db: Db, whatsappNumber: string): Promise<boolean> {
  const rows = await db
    .delete(blockedNumbers)
    .where(eq(blockedNumbers.whatsappNumber, whatsappNumber))
    .returning({ whatsappNumber: blockedNumbers.whatsappNumber });
  return rows.length > 0;
}

export async function listBlockedNumbers(db: Db): Promise<BlockedNumber[]> {
  return db
    .select()
    .from(blockedNumbers)
    .orderBy(desc(blockedNumbers.blockedAt), asc(blockedNumbers.whatsappNumber));
}
