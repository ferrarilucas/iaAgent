import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { spaceMembers, users } from "../schema";

export async function getSpaceMembers(
  db: Db,
  spaceId: string,
): Promise<Array<{ userId: string; name: string | null; role: "owner" | "member" }>> {
  const rows = await db
    .select({ userId: spaceMembers.userId, name: users.name, role: spaceMembers.role })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, spaceId));
  return rows.map((r) => ({ userId: r.userId, name: r.name, role: r.role }));
}
