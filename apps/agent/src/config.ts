import { z } from "zod";

const schema = z.object({
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_INSTANCE: z.string().min(1),
  EVOLUTION_API_KEY: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  SUBSCRIPTIONS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  BILLING_URL: z.string().url().default("https://pilinha.com.br/precos"),
});

export type AppConfig = {
  evolutionApiUrl: string;
  evolutionInstance: string;
  evolutionApiKey: string;
  googleApiKey: string;
  databaseUrl: string;
  port: number;
  subscriptionsEnabled: boolean;
  billingUrl: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(env);
  return {
    evolutionApiUrl: parsed.EVOLUTION_API_URL,
    evolutionInstance: parsed.EVOLUTION_INSTANCE,
    evolutionApiKey: parsed.EVOLUTION_API_KEY,
    googleApiKey: parsed.GOOGLE_GENERATIVE_AI_API_KEY,
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.PORT,
    subscriptionsEnabled: parsed.SUBSCRIPTIONS_ENABLED,
    billingUrl: parsed.BILLING_URL,
  };
}
