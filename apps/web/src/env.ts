import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_INSTANCE: z.string().min(1),
  EVOLUTION_API_KEY: z.string().min(1),
});

export const env = schema.parse(process.env);
