import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import type { AppConfig } from "../config";

export function buildMemory(config: AppConfig): Memory {
  const storage = new PostgresStore({ connectionString: config.databaseUrl });
  return new Memory({
    storage: storage as unknown as NonNullable<ConstructorParameters<typeof Memory>[0]>["storage"],
    options: { lastMessages: 10 },
  });
}
