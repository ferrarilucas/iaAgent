# SaaS Fase 1 (Fundação multi-tenant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao Pilinha a fundação de SaaS multi-tenant — cada usuário tem uma assinatura (trial de 7 dias no primeiro contato), o agente só responde para quem tem acesso, e a configuração de IA passa a ser resolvida por requisição a partir da assinatura.

**Architecture:** Uma tabela `subscriptions` no `packages/db` guarda plano e status. Uma função pura decide o estado de acesso a partir da assinatura e do relógio. Um "porteiro" no `processMessage` do `apps/agent` roda depois de resolver o usuário e antes de chamar a IA: sem assinatura cria trial, com acesso segue, sem acesso responde uma mensagem determinística (sem passar pelo LLM). O modelo da IA deixa de ser global e passa a ser montado por mensagem a partir do `ai_mode` da assinatura, fechando o gap do `googleApiKey` validado-mas-não-injetado.

**Tech Stack:** TypeScript, Drizzle ORM + Postgres (migrations em `packages/db/migrations`), Vitest + PGlite para testes, Hono, Mastra 1.x (`@mastra/core`), `@ai-sdk/google`.

## Global Constraints

- **Nunca escreva comentários no código** (nem inline nem de bloco). Regra do CLAUDE.md do usuário, vale para todos os arquivos.
- **Strings de usuário em português do Brasil SEM acentos** — é a convenção existente em todo o repo (ex.: `"Nao consegui processar sua mensagem agora."` em `process-message.ts:28`). Siga isso em toda mensagem nova.
- **Nada de pagamento, BYO, criptografia de chave ou cobertura de espaço nesta fase.** O schema já acomoda esses campos, mas o comportamento fica para as Fases 2–4.
- Trial: **7 dias**. Tolerância de inadimplência: **3 dias**. Valores vêm de constantes exportadas, nunca hardcoded em dois lugares.
- Tudo do porteiro fica atrás da flag de ambiente `SUBSCRIPTIONS_ENABLED` (default `false`), para poder subir em prod sem mudar comportamento.
- Testes rodam com `pnpm --filter @ia/db test` e `pnpm --filter @ia/agent test`. Migrations são geradas com `pnpm --filter @ia/db db:generate` (nunca escreva o `.sql` na mão).
- Commits em português, no padrão do repo (`feat(saas): ...`).

---

### Task 1: Tabela `subscriptions` (schema + migration)

**Files:**
- Modify: `packages/db/src/schema.ts` (adicionar enums e tabela ao final)
- Modify: `packages/db/src/types.ts` (exportar os tipos)
- Create: `packages/db/migrations/0007_<nome-gerado>.sql` (gerado pelo drizzle-kit)
- Test: `packages/db/test/subscriptions-schema.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `subscriptions` (tabela Drizzle), `subscriptionTierEnum`, `subscriptionAiModeEnum`, `subscriptionStatusEnum`, e os tipos `Subscription` / `NewSubscription` exportados por `@ia/db`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `packages/db/test/subscriptions-schema.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "@ia/db";
import { subscriptions } from "../src/schema";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (close) await close();
});

describe("tabela subscriptions", () => {
  it("guarda os quatro combos de plano com defaults de trial", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551900000001", name: "L" });

    const [row] = await t.db
      .insert(subscriptions)
      .values({ userId: user.id, tier: "individual", aiMode: "nossa", status: "trial" })
      .returning();

    expect(row.tier).toBe("individual");
    expect(row.aiMode).toBe("nossa");
    expect(row.status).toBe("trial");
    expect(row.trialEndsAt).toBeNull();
    expect(row.pastDueSince).toBeNull();
    expect(row.provider).toBeNull();
  });

  it("aceita tier espaco com ai_mode byo", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551900000002", name: "L" });

    await t.db
      .insert(subscriptions)
      .values({ userId: user.id, tier: "espaco", aiMode: "byo", status: "ativo" });

    const rows = await t.db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].tier).toBe("espaco");
    expect(rows[0].aiMode).toBe("byo");
  });

  it("garante no maximo uma assinatura por usuario", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551900000003", name: "L" });

    await t.db.insert(subscriptions).values({ userId: user.id, tier: "individual", aiMode: "nossa", status: "trial" });
    await expect(
      t.db.insert(subscriptions).values({ userId: user.id, tier: "individual", aiMode: "nossa", status: "trial" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @ia/db test subscriptions-schema`
Expected: FAIL — `subscriptions` não é exportado por `../src/schema`.

- [ ] **Step 3: Adicionar enums e tabela ao schema**

No fim de `packages/db/src/schema.ts`, adicione (e junte os enums aos outros no topo, seguindo o estilo existente):

```ts
export const subscriptionTierEnum = pgEnum("subscription_tier", ["individual", "espaco"]);
export const subscriptionAiModeEnum = pgEnum("subscription_ai_mode", ["nossa", "byo"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "ativo",
  "atrasado",
  "cancelado",
]);

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
```

- [ ] **Step 4: Exportar os tipos**

Em `packages/db/src/types.ts`, adicione `subscriptions` ao import do schema e no fim do arquivo:

```ts
export type Subscription = InferSelectModel<typeof subscriptions>;
export type NewSubscription = InferInsertModel<typeof subscriptions>;
```

- [ ] **Step 5: Gerar a migration**

Run: `pnpm --filter @ia/db db:generate`
Expected: cria `packages/db/migrations/0007_<nome-aleatorio>.sql` com os três `CREATE TYPE` e o `CREATE TABLE subscriptions`. Abra o arquivo e confirme que tem o `UNIQUE` em `user_id` — os testes com PGlite aplicam as migrations, então sem isso o teste de unicidade falha.

- [ ] **Step 6: Rodar os testes e ver passar**

Run: `pnpm --filter @ia/db test subscriptions-schema`
Expected: PASS (3 testes).

- [ ] **Step 7: Rodar a suíte inteira do db**

Run: `pnpm --filter @ia/db test`
Expected: PASS — nenhuma regressão nas suítes existentes.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/types.ts packages/db/migrations packages/db/test/subscriptions-schema.test.ts
git commit -m "feat(saas): tabela subscriptions (plano, modo de ia e status)"
```

---

### Task 2: Função pura de estado de acesso

**Files:**
- Create: `packages/db/src/repository/subscriptions.ts`
- Modify: `packages/db/src/repository/index.ts` (adicionar o export)
- Test: `packages/db/test/subscription-access.test.ts`

**Interfaces:**
- Consumes: o tipo `Subscription` da Task 1.
- Produces: `TRIAL_DAYS = 7`, `PAST_DUE_GRACE_DAYS = 3`, o tipo `AccessState = "liberado" | "trial_expirado" | "inadimplente" | "cancelado"`, e `subscriptionAccess(sub: Subscription, now?: Date): AccessState`.

Esta task é só lógica pura, sem banco — por isso é rápida de testar e é onde mora a regra de negócio. A Task 3 põe o banco em volta.

- [ ] **Step 1: Escrever o teste que falha**

Crie `packages/db/test/subscription-access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { subscriptionAccess, TRIAL_DAYS, PAST_DUE_GRACE_DAYS } from "../src/repository/subscriptions";
import type { Subscription } from "../src/types";

const base: Subscription = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  tier: "individual",
  aiMode: "nossa",
  status: "trial",
  trialEndsAt: null,
  currentPeriodEnd: null,
  pastDueSince: null,
  provider: null,
  providerCustomerId: null,
  providerSubscriptionId: null,
  createdAt: new Date("2026-08-01T12:00:00Z"),
  updatedAt: new Date("2026-08-01T12:00:00Z"),
};

const dias = (n: number) => new Date(Date.parse("2026-08-01T12:00:00Z") + n * 86400000);

describe("subscriptionAccess", () => {
  it("libera trial dentro do prazo", () => {
    const sub = { ...base, status: "trial" as const, trialEndsAt: dias(TRIAL_DAYS) };
    expect(subscriptionAccess(sub, dias(6))).toBe("liberado");
  });

  it("bloqueia trial vencido", () => {
    const sub = { ...base, status: "trial" as const, trialEndsAt: dias(TRIAL_DAYS) };
    expect(subscriptionAccess(sub, dias(8))).toBe("trial_expirado");
  });

  it("bloqueia trial sem data de fim", () => {
    const sub = { ...base, status: "trial" as const, trialEndsAt: null };
    expect(subscriptionAccess(sub, dias(0))).toBe("trial_expirado");
  });

  it("libera assinatura ativa", () => {
    const sub = { ...base, status: "ativo" as const };
    expect(subscriptionAccess(sub, dias(999))).toBe("liberado");
  });

  it("libera atrasado dentro da tolerancia", () => {
    const sub = { ...base, status: "atrasado" as const, pastDueSince: dias(0) };
    expect(subscriptionAccess(sub, dias(PAST_DUE_GRACE_DAYS - 1))).toBe("liberado");
  });

  it("bloqueia atrasado depois da tolerancia", () => {
    const sub = { ...base, status: "atrasado" as const, pastDueSince: dias(0) };
    expect(subscriptionAccess(sub, dias(PAST_DUE_GRACE_DAYS + 1))).toBe("inadimplente");
  });

  it("bloqueia atrasado sem data de inicio do atraso", () => {
    const sub = { ...base, status: "atrasado" as const, pastDueSince: null };
    expect(subscriptionAccess(sub, dias(0))).toBe("inadimplente");
  });

  it("bloqueia cancelado", () => {
    const sub = { ...base, status: "cancelado" as const };
    expect(subscriptionAccess(sub, dias(0))).toBe("cancelado");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @ia/db test subscription-access`
Expected: FAIL — não existe `../src/repository/subscriptions`.

- [ ] **Step 3: Escrever a implementação mínima**

Crie `packages/db/src/repository/subscriptions.ts`:

```ts
import type { Subscription } from "../types";

export const TRIAL_DAYS = 7;
export const PAST_DUE_GRACE_DAYS = 3;

export type AccessState = "liberado" | "trial_expirado" | "inadimplente" | "cancelado";

const DIA_MS = 86400000;

export function subscriptionAccess(sub: Subscription, now: Date = new Date()): AccessState {
  if (sub.status === "cancelado") return "cancelado";
  if (sub.status === "ativo") return "liberado";
  if (sub.status === "trial") {
    if (!sub.trialEndsAt) return "trial_expirado";
    return now.getTime() <= sub.trialEndsAt.getTime() ? "liberado" : "trial_expirado";
  }
  if (!sub.pastDueSince) return "inadimplente";
  const limite = sub.pastDueSince.getTime() + PAST_DUE_GRACE_DAYS * DIA_MS;
  return now.getTime() <= limite ? "liberado" : "inadimplente";
}
```

- [ ] **Step 4: Exportar do repository**

Em `packages/db/src/repository/index.ts`, adicione ao fim:

```ts
export * from "./subscriptions";
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `pnpm --filter @ia/db test subscription-access`
Expected: PASS (8 testes).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repository/subscriptions.ts packages/db/src/repository/index.ts packages/db/test/subscription-access.test.ts
git commit -m "feat(saas): estado de acesso da assinatura (trial, ativo, atraso, cancelado)"
```

---

### Task 3: Repository — criar trial e resolver assinatura

**Files:**
- Modify: `packages/db/src/repository/subscriptions.ts` (adicionar as funções de banco)
- Test: `packages/db/test/subscriptions.test.ts`

**Interfaces:**
- Consumes: `subscriptions` (Task 1), `TRIAL_DAYS` e `AccessState` (Task 2).
- Produces:
  - `getSubscriptionForUser(db: Db, userId: string): Promise<Subscription | undefined>`
  - `ensureTrialSubscription(db: Db, userId: string, now?: Date): Promise<Subscription>` — idempotente, cria com `status: "trial"` e `trialEndsAt = now + TRIAL_DAYS` na primeira vez e devolve a existente depois.
  - `resolveAccessForUser(db: Db, userId: string, now?: Date): Promise<{ subscription: Subscription; access: AccessState }>` — chama `ensureTrialSubscription` e aplica `subscriptionAccess`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `packages/db/test/subscriptions.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "@ia/db";
import {
  ensureTrialSubscription,
  getSubscriptionForUser,
  resolveAccessForUser,
  TRIAL_DAYS,
} from "../src/repository/subscriptions";
import { subscriptions } from "../src/schema";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (close) await close();
});

const AGORA = new Date("2026-08-01T12:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() + n * 86400000);

describe("ensureTrialSubscription", () => {
  it("cria trial de 7 dias no primeiro contato", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000001", name: "L" });

    const sub = await ensureTrialSubscription(t.db, user.id, AGORA);

    expect(sub.status).toBe("trial");
    expect(sub.tier).toBe("individual");
    expect(sub.aiMode).toBe("nossa");
    expect(sub.trialEndsAt?.getTime()).toBe(dias(TRIAL_DAYS).getTime());
  });

  it("e idempotente: nao cria uma segunda assinatura nem estende o trial", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000002", name: "L" });

    const primeira = await ensureTrialSubscription(t.db, user.id, AGORA);
    const segunda = await ensureTrialSubscription(t.db, user.id, dias(3));

    expect(segunda.id).toBe(primeira.id);
    expect(segunda.trialEndsAt?.getTime()).toBe(primeira.trialEndsAt?.getTime());
    const todas = await t.db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    expect(todas).toHaveLength(1);
  });

  it("nao rebaixa uma assinatura ativa de volta para trial", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000003", name: "L" });
    await ensureTrialSubscription(t.db, user.id, AGORA);
    await t.db.update(subscriptions).set({ status: "ativo" }).where(eq(subscriptions.userId, user.id));

    const sub = await ensureTrialSubscription(t.db, user.id, dias(30));

    expect(sub.status).toBe("ativo");
  });
});

describe("getSubscriptionForUser", () => {
  it("devolve undefined quando o usuario nao tem assinatura", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000004", name: "L" });

    expect(await getSubscriptionForUser(t.db, user.id)).toBeUndefined();
  });
});

describe("resolveAccessForUser", () => {
  it("libera no primeiro contato criando o trial", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000005", name: "L" });

    const r = await resolveAccessForUser(t.db, user.id, AGORA);

    expect(r.access).toBe("liberado");
    expect(r.subscription.status).toBe("trial");
  });

  it("bloqueia depois que o trial vence", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551910000006", name: "L" });
    await ensureTrialSubscription(t.db, user.id, AGORA);

    const r = await resolveAccessForUser(t.db, user.id, dias(TRIAL_DAYS + 1));

    expect(r.access).toBe("trial_expirado");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @ia/db test test/subscriptions.test.ts`
Expected: FAIL — `ensureTrialSubscription` não existe.

- [ ] **Step 3: Escrever a implementação mínima**

Em `packages/db/src/repository/subscriptions.ts`, adicione os imports no topo e as funções abaixo do que já existe:

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { subscriptions } from "../schema";
```

```ts
export async function getSubscriptionForUser(db: Db, userId: string): Promise<Subscription | undefined> {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return rows[0];
}

export async function ensureTrialSubscription(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<Subscription> {
  const existente = await getSubscriptionForUser(db, userId);
  if (existente) return existente;
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DIA_MS);
  const [criada] = await db
    .insert(subscriptions)
    .values({ userId, tier: "individual", aiMode: "nossa", status: "trial", trialEndsAt })
    .onConflictDoNothing({ target: subscriptions.userId })
    .returning();
  if (criada) return criada;
  return (await getSubscriptionForUser(db, userId))!;
}

export async function resolveAccessForUser(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<{ subscription: Subscription; access: AccessState }> {
  const subscription = await ensureTrialSubscription(db, userId, now);
  return { subscription, access: subscriptionAccess(subscription, now) };
}
```

O `onConflictDoNothing` + releitura cobre a corrida de duas mensagens chegando juntas no primeiro contato: uma insere, a outra relê em vez de estourar.

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `pnpm --filter @ia/db test test/subscriptions.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Rodar a suíte inteira do db**

Run: `pnpm --filter @ia/db test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repository/subscriptions.ts packages/db/test/subscriptions.test.ts
git commit -m "feat(saas): trial idempotente de 7 dias e resolucao de acesso"
```

---

### Task 4: Porteiro no agente (atrás de feature-flag)

**Files:**
- Create: `apps/agent/src/agent/gate.ts`
- Modify: `apps/agent/src/agent/process-message.ts` (adicionar o porteiro entre a resolução do usuário e o `setTyping`)
- Modify: `apps/agent/src/config.ts` (flag `SUBSCRIPTIONS_ENABLED` e `BILLING_URL`)
- Modify: `apps/agent/src/webhook/handler.ts` (passar as novas deps)
- Test: `apps/agent/test/gate.test.ts`

**Interfaces:**
- Consumes: `resolveAccessForUser` e `AccessState` (Task 3).
- Produces:
  - `blockedMessage(access: AccessState, billingUrl: string): string | null` — devolve a mensagem determinística de bloqueio, ou `null` quando `access === "liberado"`.
  - `ProcessDeps` ganha dois campos opcionais: `subscriptionsEnabled?: boolean` e `billingUrl?: string`.
  - `RunAgentArgs` ganha `aiMode: "nossa" | "byo"` (consumido pela Task 5).

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/agent/test/gate.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestDb } from "../../../packages/db/test/helpers";
import { bootstrapUser, ensureTrialSubscription, TRIAL_DAYS } from "@ia/db";
import { subscriptions } from "../../../packages/db/src/schema";
import { eq } from "drizzle-orm";
import { blockedMessage } from "../src/agent/gate";
import { processMessage } from "../src/agent/process-message";
import type { IncomingMessage } from "@ia/whatsapp";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (close) await close();
  vi.restoreAllMocks();
});

const BILLING = "https://pilinha.com.br/precos";

const msg = (id: string, numero: string): IncomingMessage => ({
  messageId: id,
  remoteJid: `${numero}@s.whatsapp.net`,
  fromNumber: numero,
  fromMe: false,
  pushName: "Lucas",
  kind: "texto",
  text: "gastei 50 no almoco",
});

describe("blockedMessage", () => {
  it("nao bloqueia quem esta liberado", () => {
    expect(blockedMessage("liberado", BILLING)).toBeNull();
  });

  it("explica o fim do trial com o link", () => {
    const texto = blockedMessage("trial_expirado", BILLING)!;
    expect(texto).toContain(BILLING);
    expect(texto.toLowerCase()).toContain("teste");
  });

  it("explica a inadimplencia com o link", () => {
    const texto = blockedMessage("inadimplente", BILLING)!;
    expect(texto).toContain(BILLING);
    expect(texto.toLowerCase()).toContain("pagamento");
  });

  it("explica o cancelamento com o link", () => {
    const texto = blockedMessage("cancelado", BILLING)!;
    expect(texto).toContain(BILLING);
    expect(texto.toLowerCase()).toContain("cancelada");
  });
});

describe("porteiro no processMessage", () => {
  const deps = (db: any, sent: string[], runAgent: any) => ({
    db,
    runAgent,
    sendText: vi.fn(async (_n: string, text: string) => {
      sent.push(text);
    }),
    markAsRead: vi.fn(async () => {}),
    setTyping: vi.fn(async () => {}),
    subscriptionsEnabled: true,
    billingUrl: BILLING,
  });

  it("cria o trial no primeiro contato e deixa passar", async () => {
    const t = await createTestDb();
    close = t.close;
    const sent: string[] = [];
    const runAgent = vi.fn(async () => "beleza");

    await processMessage(deps(t.db, sent, runAgent) as any, msg("G1", "5551920000001"));

    expect(runAgent).toHaveBeenCalledTimes(1);
    const rows = await t.db.select().from(subscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("trial");
  });

  it("bloqueia sem chamar a IA quando o trial venceu", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551920000002", name: "L" });
    const passado = new Date(Date.now() - (TRIAL_DAYS + 2) * 86400000);
    await ensureTrialSubscription(t.db, user.id, passado);

    const sent: string[] = [];
    const runAgent = vi.fn(async () => "nao deveria rodar");

    await processMessage(deps(t.db, sent, runAgent) as any, msg("G2", "5551920000002"));

    expect(runAgent).not.toHaveBeenCalled();
    expect(sent.some((t) => t.includes(BILLING))).toBe(true);
  });

  it("bloqueia quem cancelou", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551920000003", name: "L" });
    await ensureTrialSubscription(t.db, user.id);
    await t.db.update(subscriptions).set({ status: "cancelado" }).where(eq(subscriptions.userId, user.id));

    const sent: string[] = [];
    const runAgent = vi.fn(async () => "nao deveria rodar");

    await processMessage(deps(t.db, sent, runAgent) as any, msg("G3", "5551920000003"));

    expect(runAgent).not.toHaveBeenCalled();
  });

  it("com a flag desligada nao cria assinatura nem bloqueia", async () => {
    const t = await createTestDb();
    close = t.close;
    const sent: string[] = [];
    const runAgent = vi.fn(async () => "beleza");
    const d = deps(t.db, sent, runAgent) as any;
    d.subscriptionsEnabled = false;

    await processMessage(d, msg("G4", "5551920000004"));

    expect(runAgent).toHaveBeenCalledTimes(1);
    const rows = await t.db.select().from(subscriptions);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @ia/agent test gate`
Expected: FAIL — não existe `../src/agent/gate`.

- [ ] **Step 3: Escrever as mensagens de bloqueio**

Crie `apps/agent/src/agent/gate.ts`:

```ts
import type { AccessState } from "@ia/db";

export function blockedMessage(access: AccessState, billingUrl: string): string | null {
  if (access === "liberado") return null;
  if (access === "trial_expirado") {
    return `Opa! 👋 Teus dias de teste do *Pilinha* acabaram por aqui.\n\nPra continuar anotando teus gastos comigo, e so escolher um plano: ${billingUrl}`;
  }
  if (access === "inadimplente") {
    return `Eita, teu pagamento nao rolou e a assinatura ficou pendente 😕\n\nDa uma olhada aqui pra regularizar que eu volto na hora: ${billingUrl}`;
  }
  return `Tua assinatura do *Pilinha* esta cancelada.\n\nQuando quiser voltar, e so assinar de novo: ${billingUrl}`;
}
```

- [ ] **Step 4: Plugar o porteiro no processMessage**

Em `apps/agent/src/agent/process-message.ts`:

Adicione `resolveAccessForUser` ao import de `@ia/db` e `blockedMessage` ao import local:

```ts
import { resolveAccessForUser } from "@ia/db";
import { blockedMessage } from "./gate";
```

Estenda os tipos:

```ts
export type RunAgentArgs = {
  db: Db;
  userId: string;
  spaceId: string;
  threadId: string;
  incoming: IncomingMessage;
  aiMode: "nossa" | "byo";
};

export type ProcessDeps = {
  db: Db;
  runAgent: (args: RunAgentArgs) => Promise<string>;
  sendText: (toNumber: string, text: string) => Promise<void>;
  markAsRead: (message: { remoteJid: string; id: string; fromMe: boolean }) => Promise<void>;
  setTyping: (toNumber: string) => Promise<void>;
  subscriptionsEnabled?: boolean;
  billingUrl?: string;
};
```

Logo depois do bloco que resolve `user`/`spaceId` (linha ~61, antes do `await deps.setTyping(...)`), insira:

```ts
    let aiMode: "nossa" | "byo" = "nossa";
    if (deps.subscriptionsEnabled) {
      const { subscription, access } = await resolveAccessForUser(deps.db, user.id);
      const bloqueio = blockedMessage(access, deps.billingUrl ?? "");
      if (bloqueio) {
        await deps.sendText(incoming.fromNumber, bloqueio);
        return;
      }
      aiMode = subscription.aiMode;
    }
```

E passe `aiMode` na chamada do agente:

```ts
    const reply = await deps.runAgent({
      db: deps.db,
      userId: user.id,
      spaceId,
      threadId: incoming.fromNumber,
      incoming,
      aiMode,
    });
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `pnpm --filter @ia/agent test gate`
Expected: PASS (8 testes).

- [ ] **Step 6: Adicionar a flag e a URL ao config**

Em `apps/agent/src/config.ts`, adicione ao `schema` do zod:

```ts
  SUBSCRIPTIONS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  BILLING_URL: z.string().url().default("https://pilinha.com.br/precos"),
```

ao `AppConfig`:

```ts
  subscriptionsEnabled: boolean;
  billingUrl: string;
```

e ao retorno de `loadConfig`:

```ts
    subscriptionsEnabled: parsed.SUBSCRIPTIONS_ENABLED,
    billingUrl: parsed.BILLING_URL,
```

- [ ] **Step 7: Passar as deps no handler**

Em `apps/agent/src/webhook/handler.ts`, no objeto retornado por `createHandlerDeps`, adicione:

```ts
    subscriptionsEnabled: config.subscriptionsEnabled,
    billingUrl: config.billingUrl,
```

- [ ] **Step 8: Documentar as variáveis novas**

Em `.env.example`, adicione:

```
SUBSCRIPTIONS_ENABLED=false
BILLING_URL=https://pilinha.com.br/precos
```

- [ ] **Step 9: Rodar a suíte inteira do agente e o typecheck**

Run: `pnpm --filter @ia/agent test && pnpm --filter @ia/agent typecheck`
Expected: PASS — as suítes antigas (`handler.test.ts` etc.) continuam verdes porque a flag é opcional e default desligada.

- [ ] **Step 10: Commit**

```bash
git add apps/agent/src/agent/gate.ts apps/agent/src/agent/process-message.ts apps/agent/src/config.ts apps/agent/src/webhook/handler.ts apps/agent/test/gate.test.ts .env.example
git commit -m "feat(saas): porteiro de assinatura no agente atras de feature-flag"
```

---

### Task 5: Resolver de IA por requisição

**Files:**
- Create: `apps/agent/src/agent/ai-config.ts`
- Modify: `apps/agent/src/agent/agent.ts` (`buildAgent` recebe o modelo pronto)
- Modify: `apps/agent/src/webhook/handler.ts` (montar o modelo por mensagem)
- Test: `apps/agent/test/ai-config.test.ts`

**Interfaces:**
- Consumes: `aiMode` em `RunAgentArgs` (Task 4).
- Produces:
  - `type AiConfig = { modelId: string; apiKey?: string }`
  - `DEFAULT_MODEL_ID = "gemini-flash-latest"`
  - `resolveAiConfig(aiMode: "nossa" | "byo", platformKey: string): AiConfig`
  - `buildModel(cfg: AiConfig)` — devolve o `LanguageModel` do `@ai-sdk/google`.
  - `buildAgent(memory, tools, model)` — assinatura nova, o modelo vem de fora.

Fecha o gap do `config.googleApiKey` "validado mas nao injetado": a key da plataforma passa a ser injetada explicitamente no provider em vez de depender do env implícito. Em Fase 1 `byo` cai no mesmo caminho da plataforma; a Fase 3 troca só o corpo do `resolveAiConfig`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/agent/test/ai-config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveAiConfig, buildModel, DEFAULT_MODEL_ID } from "../src/agent/ai-config";

describe("resolveAiConfig", () => {
  it("usa o modelo e a chave da plataforma no modo nossa", () => {
    const cfg = resolveAiConfig("nossa", "chave-da-plataforma");
    expect(cfg.modelId).toBe(DEFAULT_MODEL_ID);
    expect(cfg.apiKey).toBe("chave-da-plataforma");
  });

  it("na fase 1 o modo byo ainda cai na chave da plataforma", () => {
    const cfg = resolveAiConfig("byo", "chave-da-plataforma");
    expect(cfg.apiKey).toBe("chave-da-plataforma");
  });
});

describe("buildModel", () => {
  it("monta um modelo com o id pedido", () => {
    const model = buildModel({ modelId: DEFAULT_MODEL_ID, apiKey: "k" });
    expect(model).toBeDefined();
    expect(model.modelId).toBe(DEFAULT_MODEL_ID);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @ia/agent test ai-config`
Expected: FAIL — não existe `../src/agent/ai-config`.

- [ ] **Step 3: Escrever a implementação mínima**

Crie `apps/agent/src/agent/ai-config.ts`:

```ts
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const DEFAULT_MODEL_ID = "gemini-flash-latest";

export type AiConfig = { modelId: string; apiKey?: string };

export function resolveAiConfig(aiMode: "nossa" | "byo", platformKey: string): AiConfig {
  return { modelId: DEFAULT_MODEL_ID, apiKey: platformKey };
}

export function buildModel(cfg: AiConfig) {
  const provider = createGoogleGenerativeAI({ apiKey: cfg.apiKey });
  return provider(cfg.modelId);
}
```

O parâmetro `aiMode` já entra na assinatura mesmo sem ramificar ainda — é o ponto de extensão da Fase 3, e deixa o chamador pronto.

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `pnpm --filter @ia/agent test ai-config`
Expected: PASS (3 testes).

- [ ] **Step 5: Fazer o buildAgent receber o modelo**

Em `apps/agent/src/agent/agent.ts`, troque o import `import { google } from "@ai-sdk/google";` por nada (remova-o) e mude a assinatura:

```ts
export function buildAgent(
  memory: Memory,
  tools: ReturnType<typeof createTools>,
  model: ReturnType<typeof buildModel>,
): Agent {
```

adicionando no topo:

```ts
import type { buildModel } from "./ai-config";
```

e no corpo do `new Agent({...})` troque `model: google("gemini-flash-latest"),` por:

```ts
    model,
```

- [ ] **Step 6: Montar o modelo por mensagem no handler**

Em `apps/agent/src/webhook/handler.ts`, adicione o import:

```ts
import { resolveAiConfig, buildModel } from "../agent/ai-config";
```

E dentro de `runAgent`, antes do `buildAgent`, monte o modelo a partir do `aiMode` recebido:

```ts
    const tools = createTools(args.db, args.userId, args.spaceId);
    const model = buildModel(resolveAiConfig(args.aiMode, config.googleApiKey));
    const agent = buildAgent(memory, tools, model);
```

Ajuste também o tipo do parâmetro de `runAgent` para incluir `aiMode: "nossa" | "byo"`.

- [ ] **Step 7: Rodar tudo e o typecheck**

Run: `pnpm --filter @ia/agent test && pnpm --filter @ia/agent typecheck`
Expected: PASS. Se `category-enum.test.ts` ou `tools.test.ts` chamarem `buildAgent`, atualize-os para passar `buildModel({ modelId: DEFAULT_MODEL_ID, apiKey: "test" })`.

- [ ] **Step 8: Rodar a suíte do monorepo inteiro**

Run: `pnpm test`
Expected: PASS em `@ia/db`, `@ia/whatsapp` e `@ia/agent`.

- [ ] **Step 9: Commit**

```bash
git add apps/agent/src/agent/ai-config.ts apps/agent/src/agent/agent.ts apps/agent/src/webhook/handler.ts apps/agent/test/ai-config.test.ts
git commit -m "feat(saas): configuracao de ia resolvida por requisicao a partir da assinatura"
```

---

## Verificação final da Fase 1

Depois da Task 5, confirme com evidência (não presuma):

- [ ] `pnpm test` verde no monorepo inteiro.
- [ ] `pnpm --filter @ia/agent typecheck` e `pnpm --filter @ia/db typecheck` limpos.
- [ ] Com `SUBSCRIPTIONS_ENABLED=false` (default) o comportamento em produção é idêntico ao de hoje — nenhuma assinatura é criada, ninguém é bloqueado.
- [ ] A migration `0007_*` está commitada e roda no deploy via `pnpm start:agent` (que já executa `db:migrate`).

## Fora do escopo (Fases 2–5)

Não implemente nada disto agora, mesmo que pareça fácil: integração de pagamento e `PaymentProvider`, tabelas `billing_events` e `ai_credentials`, telas de `/precos`, `/app/assinatura` e `/app/configuracoes/ia`, criptografia de chave BYO, cobertura de assinatura de espaço para os membros, dunning ativo por WhatsApp e rate limit anti-ban.
