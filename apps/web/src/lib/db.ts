import { createClient } from "@ia/db";
import { env } from "../env";

export const { db } = createClient(env.DATABASE_URL);
