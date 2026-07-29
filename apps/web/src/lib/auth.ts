import { betterAuth } from "better-auth";
import { phoneNumber } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { schema, ensureSpaceForUser } from "@ia/db";
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
    additionalFields: {
      whatsappNumber: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const phone = (user as { phoneNumber?: string | null }).phoneNumber;
          return { data: { ...user, whatsappNumber: phone ?? user.id } };
        },
        after: async (user) => {
          await ensureSpaceForUser(db, user.id, user.name ?? null);
        },
      },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: number, code }) => {
        await sendText(evolution, number, `Seu codigo de acesso ao painel: ${code}`);
      },
      signUpOnVerification: {
        getTempEmail: (number) => `${number}@pilinha.local`,
        getTempName: (number) => number,
      },
    }),
    nextCookies(),
  ],
});
