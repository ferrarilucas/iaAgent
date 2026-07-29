import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createClient } from "@ia/db";
import { loadConfig } from "./config";
import { createHandlerDeps, handleUpsert } from "./webhook/handler";

export function createApp(deps: ReturnType<typeof createHandlerDeps>) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/webhook", async (c) => {
    const payload = await c.req.json().catch(() => null);
    handleUpsert(deps, payload);
    return c.json({ received: true });
  });
  return app;
}

function main() {
  const config = loadConfig();
  const { db } = createClient(config.databaseUrl);
  const deps = createHandlerDeps(db, config);
  const app = createApp(deps);
  serve({ fetch: app.fetch, port: config.port });
  console.log(`agent ouvindo na porta ${config.port}`);
}

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  main();
}

