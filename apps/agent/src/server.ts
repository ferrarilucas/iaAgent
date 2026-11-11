import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createCipriWebhook, loadCipriConfig } from "./cipri/bot";

export function createCipriApp(bot: ReturnType<typeof createCipriWebhook>) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/webhook/:secret", async (c) => {
    if (!bot.authorized(c.req.param("secret"))) {
      console.warn("Webhook do Cipri recusado: segredo inválido");
      return c.notFound();
    }
    const payload = await c.req.json().catch(() => null);
    console.info("Webhook do Cipri recebido");
    try {
      await bot.process(payload);
      return c.json({ received: true });
    } catch (error) {
      const upstreamStatus = error instanceof Error
        ? /^(?:Cipri HTTP|evolution sendText) [1-5][0-9]{2}$/.exec(error.message)?.[0]
        : undefined;
      console.error("Falha no webhook do Cipri", upstreamStatus ?? (error instanceof Error ? error.name : ""));
      return c.json({ received: false }, 502);
    }
  });
  return app;
}

function main() {
  const config = loadCipriConfig();
  const app = createCipriApp(createCipriWebhook(config));
  serve({ fetch: app.fetch, port: config.PORT });
  console.log(`bot do Cipri ouvindo na porta ${config.PORT}`);
}

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  main();
}

