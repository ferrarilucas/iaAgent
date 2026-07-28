import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { categories } from "../schema";

export const DEFAULT_CATEGORIES = [
  { name: "alimentacao", type: "despesa" },
  { name: "transporte", type: "despesa" },
  { name: "moradia", type: "despesa" },
  { name: "lazer", type: "despesa" },
  { name: "saude", type: "despesa" },
  { name: "outros", type: "despesa" },
  { name: "salario", type: "receita" },
  { name: "outros", type: "receita" },
] as const;

export async function seedCategories(db: Db, spaceId: string): Promise<void> {
  await db.insert(categories).values(DEFAULT_CATEGORIES.map((c) => ({ ...c, spaceId })));
}

export async function findCategoryByName(
  db: Db,
  spaceId: string,
  name: string,
  type: "despesa" | "receita",
): Promise<{ id: string } | undefined> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.spaceId, spaceId), eq(categories.name, name), eq(categories.type, type)),
    )
    .limit(1);
  return rows[0];
}
