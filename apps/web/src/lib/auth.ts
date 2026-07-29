import { betterAuth } from "better-auth";
import { phoneNumber } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createClient, schema } from "@ia/db";
import { env } from "../env";

const { db } = createClient(env.DATABASE_URL);

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
      sendOTP: async () => {},
    }),
  ],
});
