# Fundação do Web (packages/whatsapp + budgets) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar a base compartilhada do painel: extrair o gateway do Evolution para um pacote `packages/whatsapp` (usado por agente e painel) e adicionar ao `packages/db` a tabela `budgets` (limites por categoria) com repositório e cálculo de status, além de um helper de membros com nome.

**Architecture:** Refactor + extensão de dados, sem UI. O `evolution.ts` sai de `apps/agent` para `packages/whatsapp` com um tipo de config mínimo próprio (desacoplado do `AppConfig` do agente); o agente passa a importar de lá e seus 13 testes continuam a rede de segurança. O `packages/db` ganha `budgets`, seu CRUD, o cálculo de gasto-vs-teto por escopo/mês, e `getSpaceMembers`.

**Tech Stack:** Node 20+, pnpm, TypeScript strict, Drizzle + PGlite, Vitest. `packages/whatsapp` usa apenas o `fetch` global.

## Global Constraints

- **NUNCA adicionar comentários no código** — nenhum `.ts`/config.
- **TypeScript strict** em todos os pacotes.
- **Dinheiro é `numeric(14,2)` e string** no TS; nunca coagir `amount` para número.
- **IDs `uuid` defaultRandom; timestamps `timestamptz` defaultNow.**
- **A rede de segurança não pode quebrar:** ao extrair o `packages/whatsapp`, os 13 testes do `apps/agent` e os 12+ do `packages/db` devem permanecer verdes. Se um teste quebrar, conserte a fiação, não o teste.
- **Fora deste plano:** extensão do `users`/tabelas do Better Auth (vão no Plano 2, com o gerador de schema do Better Auth); qualquer UI.
- Commits frequentes, um por tarefa, mensagens `tipo(escopo): descrição`.

---

## Estrutura de arquivos

```
packages/
  whatsapp/                         (novo)
    package.json
    tsconfig.json
    vitest.config.ts
    src/
      index.ts
      evolution.ts                  (movido de apps/agent/src/webhook/evolution.ts)
    test/
      evolution.test.ts             (movido)
  db/
    src/schema.ts                   + budgetScopeEnum, budgets
    src/repository/budgets.ts       (novo) CRUD + status
    src/repository/spaces.ts        (novo) getSpaceMembers
    src/repository/index.ts         + exports
    src/types.ts                    + Budget
    migrations/                     nova migration
apps/agent/
  package.json                      + dependencia @ia/whatsapp
  src/webhook/handler.ts            import de @ia/whatsapp
  src/agent/process-message.ts      import de @ia/whatsapp
  (remove src/webhook/evolution.ts e test/evolution.test.ts)
```

---

### Task 1: Extrair `packages/whatsapp`

Mover o gateway do Evolution para um pacote compartilhado, desacoplando-o do `AppConfig` do agente via um tipo `EvolutionConfig` mínimo. O agente passa a importar de `@ia/whatsapp`.

**Files:**
- Create: `packages/whatsapp/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`
- Move: `apps/agent/src/webhook/evolution.ts` -> `packages/whatsapp/src/evolution.ts`
- Move: `apps/agent/test/evolution.test.ts` -> `packages/whatsapp/test/evolution.test.ts`
- Modify: `apps/agent/package.json`, `apps/agent/src/webhook/handler.ts`, `apps/agent/src/agent/process-message.ts`

**Interfaces:**
- Consumes: o `evolution.ts` atual (parseUpsert, fetchMediaBase64, sendText, markAsRead, sendPresence, IncomingMessage).
- Produces: pacote `@ia/whatsapp` exportando os mesmos símbolos + o tipo `EvolutionConfig = { evolutionApiUrl: string; evolutionInstance: string; evolutionApiKey: string }`. O `apps/agent` importa deles.

- [ ] **Step 1: Criar `packages/whatsapp/package.json`**

```json
{
  "name": "@ia/whatsapp",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Criar `packages/whatsapp/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Criar `packages/whatsapp/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 4: Mover o arquivo do gateway**

Run: `git mv apps/agent/src/webhook/evolution.ts packages/whatsapp/src/evolution.ts`
Expected: arquivo movido.

- [ ] **Step 5: Desacoplar o `EvolutionConfig` em `packages/whatsapp/src/evolution.ts`**

No topo do arquivo, substitua a linha `import type { AppConfig } from "../config";` por:

```ts
export type EvolutionConfig = {
  evolutionApiUrl: string;
  evolutionInstance: string;
  evolutionApiKey: string;
};
```

E troque, em TODAS as assinaturas de função do arquivo, `config: AppConfig` por `config: EvolutionConfig`. (As funções só usam `evolutionApiUrl`, `evolutionInstance`, `evolutionApiKey`, então o corpo não muda.)

- [ ] **Step 6: Criar `packages/whatsapp/src/index.ts`**

```ts
export * from "./evolution";
```

- [ ] **Step 7: Mover e ajustar o teste**

Run: `git mv apps/agent/test/evolution.test.ts packages/whatsapp/test/evolution.test.ts`

Em `packages/whatsapp/test/evolution.test.ts`: troque o import para o pacote local e o objeto de config para `EvolutionConfig`. O topo do arquivo deve ficar:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { parseUpsert, sendText, markAsRead, sendPresence } from "../src/evolution";
import type { EvolutionConfig } from "../src/evolution";

const config: EvolutionConfig = {
  evolutionApiUrl: "https://evo.example",
  evolutionInstance: "inst",
  evolutionApiKey: "key",
};
```

O resto do arquivo de teste permanece igual.

- [ ] **Step 8: Ligar o `@ia/whatsapp` no agente e reescrever os imports**

Em `apps/agent/package.json`, adicione a dependência (mantendo as demais):
```json
    "@ia/whatsapp": "workspace:*",
```
Em `apps/agent/src/webhook/handler.ts`, troque:
```ts
import { parseUpsert, fetchMediaBase64, sendText, markAsRead, sendPresence, type IncomingMessage } from "./evolution";
```
por:
```ts
import { parseUpsert, fetchMediaBase64, sendText, markAsRead, sendPresence, type IncomingMessage } from "@ia/whatsapp";
```
Em `apps/agent/src/agent/process-message.ts`, troque `import type { IncomingMessage } from "../webhook/evolution";` por `import type { IncomingMessage } from "@ia/whatsapp";`.

- [ ] **Step 9: Instalar e verificar tudo verde**

Run: `pnpm install && pnpm --filter @ia/whatsapp test && pnpm --filter @ia/whatsapp typecheck && pnpm --filter @ia/agent test && pnpm --filter @ia/agent typecheck && pnpm --filter @ia/db test`
Expected: whatsapp tests passam; agent 13/13; db 12/12; typechecks limpos.

- [ ] **Step 10: Commit**

```bash
git add packages/whatsapp apps/agent pnpm-lock.yaml
git commit -m "refactor(whatsapp): extrai gateway do evolution para packages/whatsapp"
```

---

### Task 2: Tabela `budgets` + repositório CRUD

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/types.ts`
- Create: `packages/db/src/repository/budgets.ts`
- Modify: `packages/db/src/repository/index.ts`
- Create: `packages/db/test/budgets.test.ts`
- Generate: nova migration

**Interfaces:**
- Consumes: `Db`, schema, `bootstrapUser`, `seedCategories`, `findCategoryByName`.
- Produces:
  - tabela `budgets` + `budgetScopeEnum`, tipo `Budget`.
  - `createBudget(db, input: { categoryId: string; amount: string; scope: "user" | "space"; userId?: string; spaceId?: string }): Promise<Budget>`
  - `listBudgetsForUser(db, userId): Promise<Budget[]>`
  - `listBudgetsForSpace(db, spaceId): Promise<Budget[]>`
  - `updateBudget(db, id, patch: { amount: string }): Promise<Budget | undefined>`
  - `deleteBudget(db, id): Promise<void>`

- [ ] **Step 1: Adicionar `budgetScopeEnum` e `budgets` em `schema.ts`**

```ts
export const budgetScopeEnum = pgEnum("budget_scope", ["user", "space"]);

export const budgets = pgTable("budgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  scope: budgetScopeEnum("scope").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Adicionar o tipo em `types.ts`**

```ts
import { budgets } from "./schema";
export type Budget = InferSelectModel<typeof budgets>;
```
(adicione `budgets` ao import existente de `./schema` e a linha do tipo junto dos demais).

- [ ] **Step 3: Gerar a migration**

Run: `pnpm --filter @ia/db db:generate`
Expected: nova migration criando `budget_scope` e a tabela `budgets`.

- [ ] **Step 4: Escrever o teste — `packages/db/test/budgets.test.ts`**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { seedCategories, findCategoryByName } from "../src/repository/categories";
import { createBudget, listBudgetsForUser, listBudgetsForSpace, updateBudget, deleteBudget } from "../src/repository/budgets";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("budgets repository", () => {
  it("cria e lista limite pessoal e de espaco separadamente", async () => {
    const t = await createTestDb(); close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "51", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");

    const pessoal = await createBudget(t.db, { categoryId: alim!.id, amount: "300.00", scope: "user", userId: user.id });
    const doEspaco = await createBudget(t.db, { categoryId: alim!.id, amount: "800.00", scope: "space", spaceId: space.id });

    expect(pessoal.scope).toBe("user");
    expect(doEspaco.scope).toBe("space");
    const meus = await listBudgetsForUser(t.db, user.id);
    expect(meus.map((b) => b.amount)).toEqual(["300.00"]);
    const doSpace = await listBudgetsForSpace(t.db, space.id);
    expect(doSpace.map((b) => b.amount)).toEqual(["800.00"]);
  });

  it("atualiza e apaga", async () => {
    const t = await createTestDb(); close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "52", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");
    const b = await createBudget(t.db, { categoryId: alim!.id, amount: "300.00", scope: "user", userId: user.id });
    const upd = await updateBudget(t.db, b.id, { amount: "350.00" });
    expect(upd?.amount).toBe("350.00");
    await deleteBudget(t.db, b.id);
    expect(await listBudgetsForUser(t.db, user.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `pnpm --filter @ia/db test budgets`
Expected: FAIL — módulo `../src/repository/budgets` não existe.

- [ ] **Step 6: Implementar `packages/db/src/repository/budgets.ts`**

```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { budgets } from "../schema";
import type { Budget } from "../types";

export async function createBudget(
  db: Db,
  input: { categoryId: string; amount: string; scope: "user" | "space"; userId?: string; spaceId?: string },
): Promise<Budget> {
  const [row] = await db
    .insert(budgets)
    .values({
      categoryId: input.categoryId,
      amount: input.amount,
      scope: input.scope,
      userId: input.userId ?? null,
      spaceId: input.spaceId ?? null,
    })
    .returning();
  return row;
}

export async function listBudgetsForUser(db: Db, userId: string): Promise<Budget[]> {
  return db.select().from(budgets).where(and(eq(budgets.scope, "user"), eq(budgets.userId, userId)));
}

export async function listBudgetsForSpace(db: Db, spaceId: string): Promise<Budget[]> {
  return db.select().from(budgets).where(and(eq(budgets.scope, "space"), eq(budgets.spaceId, spaceId)));
}

export async function updateBudget(db: Db, id: string, patch: { amount: string }): Promise<Budget | undefined> {
  const [row] = await db.update(budgets).set({ amount: patch.amount }).where(eq(budgets.id, id)).returning();
  return row;
}

export async function deleteBudget(db: Db, id: string): Promise<void> {
  await db.delete(budgets).where(eq(budgets.id, id));
}
```

- [ ] **Step 7: Exportar no barrel**

Adicionar a `packages/db/src/repository/index.ts`:
```ts
export * from "./budgets";
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @ia/db test budgets && pnpm --filter @ia/db typecheck`
Expected: PASS (2 testes); typecheck limpo.

- [ ] **Step 9: Commit**

```bash
git add packages/db
git commit -m "feat(db): tabela budgets e repositorio CRUD"
```

---

### Task 3: Status do limite (gasto vs teto por escopo/mês)

Computar o gasto do período para um limite: escopo `user` soma `created_by = userId`; escopo `space` soma todos os membros do espaço. Sempre `despesa`, filtrando pela categoria do limite e pela janela de datas.

**Files:**
- Modify: `packages/db/src/repository/budgets.ts`
- Modify: `packages/db/test/budgets.test.ts`

**Interfaces:**
- Consumes: `Budget`, `getSpaceMemberUserIds` (de `./users`), `transactions`.
- Produces:
  - `getBudgetStatus(db, budget: Budget, from: string, to: string): Promise<{ limit: string; spent: string; ratio: number }>` — `from`/`to` no formato `YYYY-MM-DD` (a UI calcula o mês no fuso America/Sao_Paulo). `ratio = spent/limit` (0 se limit for 0).

- [ ] **Step 1: Adicionar o teste ao `budgets.test.ts`**

```ts
import { insertTransactions } from "../src/repository/transactions";
import { getBudgetStatus } from "../src/repository/budgets";
import { spaceMembers } from "../src/schema";

it("status pessoal soma so o proprio usuario; status do espaco soma todos", async () => {
  const t = await createTestDb(); close = t.close;
  const a = await bootstrapUser(t.db, { whatsappNumber: "111", name: "A" });
  const b = await bootstrapUser(t.db, { whatsappNumber: "222", name: "B" });
  await seedCategories(t.db, a.space.id);
  await t.db.insert(spaceMembers).values({ spaceId: a.space.id, userId: b.user.id, role: "member" });
  const alim = await findCategoryByName(t.db, a.space.id, "alimentacao", "despesa");
  await insertTransactions(t.db, [
    { createdBy: a.user.id, type: "despesa", amount: "100.00", categoryId: alim!.id, occurredAt: "2026-07-10", source: "texto" },
    { createdBy: b.user.id, type: "despesa", amount: "40.00", categoryId: alim!.id, occurredAt: "2026-07-11", source: "texto" },
  ]);

  const pessoal = await createBudget(t.db, { categoryId: alim!.id, amount: "200.00", scope: "user", userId: a.user.id });
  const doEspaco = await createBudget(t.db, { categoryId: alim!.id, amount: "200.00", scope: "space", spaceId: a.space.id });

  const sp = await getBudgetStatus(t.db, pessoal, "2026-07-01", "2026-07-31");
  expect(sp.spent).toBe("100.00");
  expect(sp.ratio).toBeCloseTo(0.5);

  const ss = await getBudgetStatus(t.db, doEspaco, "2026-07-01", "2026-07-31");
  expect(ss.spent).toBe("140.00");
  expect(ss.ratio).toBeCloseTo(0.7);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ia/db test budgets`
Expected: FAIL — `getBudgetStatus` não existe.

- [ ] **Step 3: Implementar `getBudgetStatus` em `budgets.ts`**

Adicionar os imports no topo (`gte`, `lte`, `inArray`, `sql` de `drizzle-orm`; `transactions` de `../schema`; `getSpaceMemberUserIds` de `./users`) e a função:

```ts
export async function getBudgetStatus(
  db: Db,
  budget: Budget,
  from: string,
  to: string,
): Promise<{ limit: string; spent: string; ratio: number }> {
  let creators: string[];
  if (budget.scope === "user") {
    creators = budget.userId ? [budget.userId] : [];
  } else {
    creators = budget.spaceId ? await getSpaceMemberUserIds(db, budget.spaceId) : [];
  }
  let spent = "0.00";
  if (creators.length > 0) {
    const rows = await db
      .select({ total: sql<string>`coalesce(sum(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          inArray(transactions.createdBy, creators),
          eq(transactions.categoryId, budget.categoryId),
          eq(transactions.type, "despesa"),
          gte(transactions.occurredAt, from),
          lte(transactions.occurredAt, to),
        ),
      );
    spent = Number(rows[0]?.total ?? 0).toFixed(2);
  }
  const limitNum = Number(budget.amount);
  const ratio = limitNum > 0 ? Number(spent) / limitNum : 0;
  return { limit: budget.amount, spent, ratio };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ia/db test budgets && pnpm --filter @ia/db typecheck`
Expected: PASS (3 testes); typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repository/budgets.ts packages/db/test/budgets.test.ts
git commit -m "feat(db): getBudgetStatus (gasto vs teto por escopo/mes)"
```

---

### Task 4: `getSpaceMembers` (membros com nome)

O painel de Espaços precisa dos membros com nome, não só ids.

**Files:**
- Create: `packages/db/src/repository/spaces.ts`
- Modify: `packages/db/src/repository/index.ts`
- Create: `packages/db/test/spaces.test.ts`

**Interfaces:**
- Consumes: `Db`, `bootstrapUser`, `spaceMembers`, `users`.
- Produces: `getSpaceMembers(db, spaceId): Promise<Array<{ userId: string; name: string | null; role: "owner" | "member" }>>`

- [ ] **Step 1: Escrever o teste — `packages/db/test/spaces.test.ts`**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { getSpaceMembers } from "../src/repository/spaces";
import { spaceMembers } from "../src/schema";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("getSpaceMembers", () => {
  it("retorna membros com nome e papel", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await bootstrapUser(t.db, { whatsappNumber: "111", name: "Lucas" });
    const b = await bootstrapUser(t.db, { whatsappNumber: "222", name: "Ana" });
    await t.db.insert(spaceMembers).values({ spaceId: a.space.id, userId: b.user.id, role: "member" });

    const membros = await getSpaceMembers(t.db, a.space.id);
    const byName = Object.fromEntries(membros.map((m) => [m.name, m.role]));
    expect(byName["Lucas"]).toBe("owner");
    expect(byName["Ana"]).toBe("member");
    expect(membros).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ia/db test spaces`
Expected: FAIL — módulo `../src/repository/spaces` não existe.

- [ ] **Step 3: Implementar `packages/db/src/repository/spaces.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { spaceMembers, users } from "../schema";

export async function getSpaceMembers(
  db: Db,
  spaceId: string,
): Promise<Array<{ userId: string; name: string | null; role: "owner" | "member" }>> {
  const rows = await db
    .select({ userId: spaceMembers.userId, name: users.name, role: spaceMembers.role })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, spaceId));
  return rows.map((r) => ({ userId: r.userId, name: r.name, role: r.role }));
}
```

- [ ] **Step 4: Exportar no barrel**

Adicionar a `packages/db/src/repository/index.ts`:
```ts
export * from "./spaces";
```

- [ ] **Step 5: Rodar tudo do db**

Run: `pnpm --filter @ia/db test && pnpm --filter @ia/db typecheck`
Expected: toda a suíte passa; typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repository/spaces.ts packages/db/src/repository/index.ts packages/db/test/spaces.test.ts
git commit -m "feat(db): getSpaceMembers (membros com nome e papel)"
```

---

## Self-Review (feito pelo autor do plano)

**Cobertura do spec (fundação):**
- Extrair `packages/whatsapp` (agente e painel importam) → Task 1. ✔
- Agente segue verde após a extração (rede de segurança) → Task 1, Step 9. ✔
- Tabela `budgets` (scope user/space, user_id/space_id, amount mensal) → Task 2. ✔
- CRUD de budgets → Task 2. ✔
- Cálculo gasto-vs-teto por escopo/mês (pessoal = só o usuário; espaço = todos) → Task 3. ✔
- `getSpaceMembers` (membros com nome, pro painel de espaços) → Task 4. ✔
- Dinheiro string; PGlite nos testes → todas as tasks. ✔

**Fora deste plano (Plano 2):** extensão do `users` + tabelas do Better Auth (com o gerador de schema do Better Auth); `apps/web`. Motivo: o schema exato do Better Auth vem do gerador dele, wired no Plano 2.

**Placeholders:** nenhum — todo step traz código/comando real.

**Consistência de tipos:** `EvolutionConfig`, `Budget`, `createBudget/listBudgetsForUser/listBudgetsForSpace/updateBudget/deleteBudget/getBudgetStatus`, `getSpaceMembers` são referenciados de forma idêntica entre tasks. O `ratio` usa `Number(...)` apenas para o display do progresso (não persiste), mantendo `amount`/`spent` como string.
