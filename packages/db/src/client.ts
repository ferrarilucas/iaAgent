import type { PgDatabase } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<any, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export function createClient(url: string): { db: Db; close: () => Promise<void> } {
  const sql = postgres(url);
  const db = drizzle(sql, { schema }) as unknown as Db;
  return { db, close: () => sql.end() };
}
