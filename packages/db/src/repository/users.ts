import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { users, spaces, spaceMembers, categories } from "../schema";
import type { User, Space } from "../types";
import { DEFAULT_CATEGORIES } from "./categories";

export async function getUserByWhatsappNumber(
  db: Db,
  whatsappNumber: string,
): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.whatsappNumber, whatsappNumber)).limit(1);
  return rows[0];
}

export async function bootstrapUser(
  db: Db,
  input: { whatsappNumber: string; name?: string },
): Promise<{ user: User; space: Space }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        whatsappNumber: input.whatsappNumber,
        name: input.name ?? null,
        phoneNumber: input.whatsappNumber,
      })
      .returning();
    const spaceName = `Pessoal do ${input.name ?? "usuario"}`;
    const [space] = await tx.insert(spaces).values({ name: spaceName }).returning();
    await tx.insert(spaceMembers).values({ spaceId: space.id, userId: user.id, role: "owner" });
    return { user, space };
  });
}

export async function ensureSpaceForUser(db: Db, userId: string, name?: string | null): Promise<Space> {
  const existing = await getSpaceForUser(db, userId);
  if (existing) return existing;
  return db.transaction(async (tx) => {
    const [space] = await tx.insert(spaces).values({ name: `Pessoal do ${name ?? "usuario"}` }).returning();
    await tx.insert(spaceMembers).values({ spaceId: space.id, userId, role: "owner" });
    await tx.insert(categories).values(DEFAULT_CATEGORIES.map((c) => ({ ...c, spaceId: space.id })));
    return space;
  });
}

export async function getSpaceForUser(db: Db, userId: string): Promise<Space | undefined> {
  const rows = await db
    .select({ space: spaces })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(eq(spaceMembers.userId, userId))
    .limit(1);
  return rows[0]?.space;
}

export async function getSpaceMemberUserIds(db: Db, spaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, spaceId));
  return rows.map((r) => r.userId);
}
