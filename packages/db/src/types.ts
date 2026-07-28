import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { users, spaces, transactions, invitations } from "./schema";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Space = InferSelectModel<typeof spaces>;
export type Transaction = InferSelectModel<typeof transactions>;
export type NewTransaction = InferInsertModel<typeof transactions>;
export type Invitation = InferSelectModel<typeof invitations>;
