import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  primaryKey,
  boolean,
  integer,
  unique,
} from "drizzle-orm/pg-core";

export const txTypeEnum = pgEnum("tx_type", ["despesa", "receita"]);
export const sourceEnum = pgEnum("source", ["texto", "audio", "foto", "video", "pdf"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "member"]);
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "declined"]);
export const budgetScopeEnum = pgEnum("budget_scope", ["user", "space"]);
export const subscriptionTierEnum = pgEnum("subscription_tier", ["individual", "espaco"]);
export const subscriptionAiModeEnum = pgEnum("subscription_ai_mode", ["nossa", "byo"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "ativo",
  "atrasado",
  "cancelado",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  whatsappNumber: text("whatsapp_number").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  email: text("email"),
  emailVerified: boolean("email_verified").default(false).notNull(),
  phoneNumber: text("phone_number"),
  phoneNumberVerified: boolean("phone_number_verified").default(false).notNull(),
  image: text("image"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const spaces = pgTable("spaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const spaceMembers = pgTable(
  "space_members",
  {
    spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.spaceId, t.userId] }) }),
);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: txTypeEnum("type").notNull(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  type: txTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  description: text("description"),
  occurredAt: date("occurred_at").notNull(),
  source: sourceEnum("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  spaceId: uuid("space_id").notNull().references(() => spaces.id, { onDelete: "cascade" }),
  invitedBy: uuid("invited_by").notNull().references(() => users.id),
  invitedNumber: text("invited_number").notNull(),
  status: inviteStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const blockedNumbers = pgTable("blocked_numbers", {
  whatsappNumber: text("whatsapp_number").primaryKey(),
  reason: text("reason"),
  blockedAt: timestamp("blocked_at", { withTimezone: true }).defaultNow().notNull(),
});

export const processedMessages = pgTable("processed_messages", {
  messageId: text("message_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const budgetAlertNotifications = pgTable(
  "budget_alert_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqDestinatario: unique().on(t.userId, t.categoryId, t.scope),
  }),
);

export const budgets = pgTable("budgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  scope: budgetScopeEnum("scope").notNull(),
  referenceDay: integer("reference_day").notNull().default(1),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: uuid("id").defaultRandom().primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const verification = pgTable("verification", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  tier: subscriptionTierEnum("tier").notNull().default("individual"),
  aiMode: subscriptionAiModeEnum("ai_mode").notNull().default("nossa"),
  status: subscriptionStatusEnum("status").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  pastDueSince: timestamp("past_due_since", { withTimezone: true }),
  provider: text("provider"),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
