import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { processedMessages } from "../schema";

export async function isMessageProcessed(db: Db, messageId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(processedMessages)
    .where(eq(processedMessages.messageId, messageId))
    .limit(1);
  return rows.length > 0;
}

export async function markMessageProcessed(db: Db, messageId: string): Promise<boolean> {
  const rows = await db
    .insert(processedMessages)
    .values({ messageId })
    .onConflictDoNothing()
    .returning({ messageId: processedMessages.messageId });
  return rows.length > 0;
}
