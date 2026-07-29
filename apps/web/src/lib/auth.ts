import { betterAuth } from "better-auth";
import { phoneNumber } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { schema } from "@ia/db";
import { sendText } from "@ia/whatsapp";
import { db } from "./db";
import { env } from "../env";

const evolution = {
  evolutionApiUrl: env.EVOLUTION_API_URL,
  evolutionInstance: env.EVOLUTION_INSTANCE,
  evolutionApiKey: env.EVOLUTION_API_KEY,
};

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  user: {
    modelName: "users",
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: number, code }) => {
        await sendText(evolution, number, `Seu codigo de acesso ao painel: ${code}`);
      },
    }),
    nextCookies(),
  ],
});
