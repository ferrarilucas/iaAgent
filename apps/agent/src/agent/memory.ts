import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import type { AppConfig } from "../config";

export function buildMemory(config: AppConfig): Memory {
  const storage = new PostgresStore({ id: "agent-memory-storage", connectionString: config.databaseUrl });
  return new Memory({
    storage,
    options: { lastMessages: 10 },
  });
}
