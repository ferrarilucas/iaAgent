# Fundação e Camada de Dados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Montar o monorepo, de-riscar o multimodal do Gemini via Mastra e entregar `packages/db` (schema Drizzle + migrations + repository) totalmente testado, servindo de base para os planos do agente e do painel.

**Architecture:** Monorepo pnpm + Turborepo com pacotes compartilhados. A camada de dados (`packages/db`) é a fonte única da verdade do schema Postgres, consumida depois pelo agente (`apps/agent`) e pelo painel (`apps/web`). O modelo é de transparência total: a transação pertence a quem lançou (`created_by`) e a visibilidade vem da participação no espaço.

**Tech Stack:** Node 20+, pnpm, TypeScript 5 (strict), Turborepo, Drizzle ORM + drizzle-kit, postgres.js (produção), PGlite (testes in-process), Vitest, Mastra + `@ai-sdk/google` (spike de validação).

## Global Constraints

- **Node.js >= 20** e **pnpm** como gerenciador de pacotes (workspaces).
- **TypeScript em modo `strict`** em todos os pacotes.
- **NUNCA adicionar comentários no código** — nem inline, nem de bloco. Regra do dono do projeto, vale para todo arquivo `.ts`/`.tsx`/config. Código deve se explicar por nomes.
- **Dinheiro é sempre `numeric(14,2)`** no banco e manipulado como **string** no TypeScript (driver Drizzle retorna `numeric` como string). Nunca usar `float`/`number` para valores monetários.
- **IDs são `uuid`** com `defaultRandom()` (usa `gen_random_uuid()`, nativo no Postgres 13+).
- **Timestamps** são `timestamp with time zone` com `defaultNow()`.
- Commits frequentes, um por tarefa concluída, mensagens no formato `tipo: descrição`.

---

## Estrutura de arquivos (o que este plano cria)

```
iaAgent/
  package.json                     workspace root (pnpm)
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .gitignore
  .env.example
  docker-compose.yml               postgres (dev)
  spikes/
    gemini-multimodal.ts           validação do risco nº 1 (Fase 0)
  packages/
    db/
      package.json
      tsconfig.json
      drizzle.config.ts
      vitest.config.ts
      migrations/                  gerado pelo drizzle-kit
      src/
        schema.ts                  tabelas Drizzle (fonte única da verdade)
        client.ts                  cliente postgres.js + tipo Db
        types.ts                   tipos inferidos re-exportados
        repository/
          users.ts                 bootstrap + lookups de usuário/espaço
          categories.ts            seed + busca de categorias
          transactions.ts          insert (lote), listagem e somatórios por espaço
          invitations.ts           criar / aceitar (com merge de espaço)
          index.ts
        index.ts                   barrel export do pacote
      test/
        helpers.ts                 PGlite + migrate para testes
        users.test.ts
        categories.test.ts
        transactions.test.ts
        invitations.test.ts
```

Cada arquivo de `repository/` tem uma responsabilidade única (um agregado do domínio). `schema.ts` não conhece regra de negócio; o repository não conhece HTTP/WhatsApp/LLM.

---

### Task 1: Scaffolding do monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Consumes: nada.
- Produces: workspace pnpm com `packages/*` e `apps/*`; `tsconfig.base.json` estendido por todos os pacotes; scripts `pnpm build`/`test`/`lint` via Turborepo.

- [ ] **Step 1: Criar `package.json` raiz**

```json
{
  "name": "ia-agent",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Criar `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Criar `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {}
  }
}
```

- [ ] **Step 4: Criar `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 5: Criar `.gitignore`**

```
node_modules/
dist/
.env
.env.local
.turbo/
*.log
```

- [ ] **Step 6: Criar `.env.example`**

```
DATABASE_URL=postgresql://ia:ia@localhost:5432/ia_agent
GOOGLE_GENERATIVE_AI_API_KEY=
```

- [ ] **Step 7: Instalar dependências e verificar**

Run: `pnpm install`
Expected: instala sem erro; cria `pnpm-lock.yaml`.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .gitignore .env.example pnpm-lock.yaml
git commit -m "chore: scaffolding do monorepo pnpm + turborepo"
```

---

### Task 2: Spike de validação multimodal do Gemini via Mastra (Fase 0)

Objetivo: provar que áudio e vídeo passam pelo Gemini através do AI SDK antes de construir o agente. Se falhar, o plano do agente isola esse trecho no SDK direto do Gemini. É um script de validação, mantido em `spikes/` para referência.

**Files:**
- Create: `spikes/gemini-multimodal.ts`
- Create: `spikes/package.json`
- Modify: `.env.example` (já contém a chave; sem mudança se presente)

**Interfaces:**
- Consumes: `GOOGLE_GENERATIVE_AI_API_KEY` do ambiente.
- Produces: evidência (saída de console) de que o Gemini transcreve/interpreta um áudio. Nenhum código de produção depende deste script.

- [ ] **Step 1: Criar `spikes/package.json`**

```json
{
  "name": "spike-gemini",
  "private": true,
  "type": "module",
  "scripts": { "run": "tsx gemini-multimodal.ts" },
  "dependencies": {
    "@ai-sdk/google": "^1.0.0",
    "ai": "^4.0.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Criar `spikes/gemini-multimodal.ts`**

```ts
import { readFileSync } from "node:fs";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

async function main() {
  const audioPath = process.argv[2];
  if (!audioPath) {
    throw new Error("uso: pnpm run run <caminho-do-audio.ogg>");
  }
  const audio = readFileSync(audioPath);
  const result = await generateText({
    model: google("gemini-2.5-flash"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcreva este audio e extraia valor, categoria e data se houver um gasto.",
          },
          { type: "file", mediaType: "audio/ogg", data: audio },
        ],
      },
    ],
  });
  console.log(result.text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Instalar deps do spike**

Run: `cd spikes && pnpm install`
Expected: instala sem erro.

- [ ] **Step 4: Rodar com um áudio real de teste**

Grave um `.ogg` curto falando "gastei cinquenta reais no almoço hoje", salve em `spikes/teste.ogg`, exporte a chave e rode:

Run: `cd spikes && GOOGLE_GENERATIVE_AI_API_KEY=<sua-chave> pnpm run run teste.ogg`
Expected: a saída contém a transcrição e menciona valor 50 / almoço / data de hoje.

- [ ] **Step 5: Registrar o resultado**

Se PASSOU: o design segue com Mastra/AI SDK para todas as mídias. Se FALHOU para áudio/vídeo: anotar no spec (Riscos) que o trecho de áudio/vídeo usará o SDK direto do Gemini, e o plano do agente deve refletir isso. Registre a decisão no corpo do commit.

- [ ] **Step 6: Commit**

```bash
git add spikes/
git commit -m "spike: valida multimodal (audio) do gemini via ai-sdk"
```

---

### Task 3: Pacote `packages/db` — configuração e schema

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` (apenas para o drizzle-kit gerar/aplicar migrations).
- Produces: tabelas Drizzle exportadas de `schema.ts` — `users`, `spaces`, `spaceMembers`, `categories`, `transactions`, `invitations`, e os enums `txTypeEnum`, `sourceEnum`, `memberRoleEnum`, `inviteStatusEnum`.

- [ ] **Step 1: Criar `packages/db/package.json`**

```json
{
  "name": "@ia/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.0"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.2.0",
    "drizzle-kit": "^0.28.0",
    "vitest": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Criar `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src", "test", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Criar `packages/db/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://ia:ia@localhost:5432/ia_agent",
  },
});
```

- [ ] **Step 4: Criar `packages/db/src/schema.ts`**

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";

export const txTypeEnum = pgEnum("tx_type", ["despesa", "receita"]);
export const sourceEnum = pgEnum("source", ["texto", "audio", "foto", "video", "pdf"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "member"]);
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "declined"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  whatsappNumber: text("whatsapp_number").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
```

- [ ] **Step 5: Instalar e gerar a migration inicial**

Run: `pnpm install && pnpm --filter @ia/db db:generate`
Expected: cria `packages/db/migrations/0000_*.sql` com todas as tabelas e enums.

- [ ] **Step 6: Verificar tipagem**

Run: `pnpm --filter @ia/db typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add packages/db/package.json packages/db/tsconfig.json packages/db/drizzle.config.ts packages/db/src/schema.ts packages/db/migrations pnpm-lock.yaml
git commit -m "feat(db): schema drizzle e migration inicial"
```

---

### Task 4: Cliente, tipos e harness de testes com PGlite

**Files:**
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/types.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/test/helpers.ts`

**Interfaces:**
- Consumes: `schema.ts` (Task 3).
- Produces:
  - `type Db` — instância Drizzle aceita por todo o repository (compatível com postgres.js e PGlite).
  - `createClient(url: string): { db: Db; close: () => Promise<void> }` — cliente de produção.
  - Tipos inferidos: `User`, `NewUser`, `Space`, `Transaction`, `NewTransaction`, `Invitation`.
  - `createTestDb(): Promise<{ db: Db; close: () => Promise<void> }>` — banco PGlite migrado, para testes.

- [ ] **Step 1: Criar `packages/db/src/client.ts`**

```ts
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PgDatabase<any, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export function createClient(url: string): { db: Db; close: () => Promise<void> } {
  const sql = postgres(url);
  const db = drizzle(sql, { schema }) as unknown as Db;
  return { db, close: () => sql.end() };
}
```

- [ ] **Step 2: Criar `packages/db/src/types.ts`**

```ts
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { users, spaces, transactions, invitations } from "./schema";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Space = InferSelectModel<typeof spaces>;
export type Transaction = InferSelectModel<typeof transactions>;
export type NewTransaction = InferInsertModel<typeof transactions>;
export type Invitation = InferSelectModel<typeof invitations>;
```

- [ ] **Step 3: Criar `packages/db/src/index.ts`**

```ts
export * as schema from "./schema";
export * from "./schema";
export * from "./client";
export * from "./types";
export * from "./repository";
```

- [ ] **Step 4: Criar `packages/db/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 5: Criar `packages/db/test/helpers.ts`**

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/schema";
import type { Db } from "../src/client";

export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db as any, { migrationsFolder: "./migrations" });
  return { db, close: () => client.close() };
}
```

- [ ] **Step 6: Criar um `repository/index.ts` mínimo temporário para o barrel compilar**

```ts
export {};
```

- [ ] **Step 7: Verificar tipagem**

Run: `pnpm --filter @ia/db typecheck`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/client.ts packages/db/src/types.ts packages/db/src/index.ts packages/db/vitest.config.ts packages/db/test/helpers.ts packages/db/src/repository/index.ts
git commit -m "feat(db): cliente, tipos inferidos e harness de teste com pglite"
```

---

### Task 5: Repository de usuários e espaços (bootstrap + lookups)

Regra do modelo B: cada usuário pertence a exatamente um espaço. O bootstrap cria usuário + espaço pessoal + membership `owner` numa transação atômica.

**Files:**
- Create: `packages/db/src/repository/users.ts`
- Modify: `packages/db/src/repository/index.ts`
- Create: `packages/db/test/users.test.ts`

**Interfaces:**
- Consumes: `Db`, `schema` (Tasks 3–4).
- Produces:
  - `getUserByWhatsappNumber(db, whatsappNumber): Promise<User | undefined>`
  - `bootstrapUser(db, input: { whatsappNumber: string; name?: string }): Promise<{ user: User; space: Space }>`
  - `getSpaceForUser(db, userId): Promise<Space | undefined>`
  - `getSpaceMemberUserIds(db, spaceId): Promise<string[]>`

- [ ] **Step 1: Escrever o teste que falha**

`packages/db/test/users.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import {
  bootstrapUser,
  getUserByWhatsappNumber,
  getSpaceForUser,
  getSpaceMemberUserIds,
} from "../src/repository/users";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("users repository", () => {
  it("bootstrap cria usuario, espaco pessoal e membership owner", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "5511999", name: "Lucas" });

    expect(user.whatsappNumber).toBe("5511999");
    expect(space.name).toContain("Lucas");

    const found = await getUserByWhatsappNumber(t.db, "5511999");
    expect(found?.id).toBe(user.id);

    const userSpace = await getSpaceForUser(t.db, user.id);
    expect(userSpace?.id).toBe(space.id);

    const memberIds = await getSpaceMemberUserIds(t.db, space.id);
    expect(memberIds).toEqual([user.id]);
  });

  it("getUserByWhatsappNumber retorna undefined para numero desconhecido", async () => {
    const t = await createTestDb();
    close = t.close;
    expect(await getUserByWhatsappNumber(t.db, "0000")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @ia/db test users`
Expected: FAIL — módulo `../src/repository/users` não existe.

- [ ] **Step 3: Implementar `packages/db/src/repository/users.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { users, spaces, spaceMembers } from "../schema";
import type { User, Space } from "../types";

export async function getUserByWhatsappNumber(
  db: Db,
  whatsappNumber: string,
): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.whatsappNumber, whatsappNumber)).limit(1);
  return rows[0];
}

export async function bootstrapUser(
  db: Db,
  input: { whatsappNumber: string; name?: string },
): Promise<{ user: User; space: Space }> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ whatsappNumber: input.whatsappNumber, name: input.name ?? null })
      .returning();
    const spaceName = `Pessoal do ${input.name ?? "usuario"}`;
    const [space] = await tx.insert(spaces).values({ name: spaceName }).returning();
    await tx.insert(spaceMembers).values({ spaceId: space.id, userId: user.id, role: "owner" });
    return { user, space };
  });
}

export async function getSpaceForUser(db: Db, userId: string): Promise<Space | undefined> {
  const rows = await db
    .select({ space: spaces })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(eq(spaceMembers.userId, userId))
    .limit(1);
  return rows[0]?.space;
}

export async function getSpaceMemberUserIds(db: Db, spaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, spaceId));
  return rows.map((r) => r.userId);
}
```

- [ ] **Step 4: Exportar no barrel — `packages/db/src/repository/index.ts`**

```ts
export * from "./users";
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `pnpm --filter @ia/db test users`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repository/users.ts packages/db/src/repository/index.ts packages/db/test/users.test.ts
git commit -m "feat(db): repository de usuarios e espacos com bootstrap"
```

---

### Task 6: Repository de categorias (seed + busca)

**Files:**
- Create: `packages/db/src/repository/categories.ts`
- Modify: `packages/db/src/repository/index.ts`
- Create: `packages/db/test/categories.test.ts`

**Interfaces:**
- Consumes: `Db`, `schema`, `bootstrapUser` (para obter um `space` nos testes).
- Produces:
  - `DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; type: "despesa" | "receita" }>`
  - `seedCategories(db, spaceId): Promise<void>`
  - `findCategoryByName(db, spaceId, name, type): Promise<{ id: string } | undefined>`

- [ ] **Step 1: Escrever o teste que falha**

`packages/db/test/categories.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { seedCategories, findCategoryByName, DEFAULT_CATEGORIES } from "../src/repository/categories";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("categories repository", () => {
  it("seed cria as categorias padrao no espaco", async () => {
    const t = await createTestDb();
    close = t.close;
    const { space } = await bootstrapUser(t.db, { whatsappNumber: "551188", name: "Ana" });

    await seedCategories(t.db, space.id);

    const alimentacao = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");
    expect(alimentacao).toBeDefined();
    const salario = await findCategoryByName(t.db, space.id, "salario", "receita");
    expect(salario).toBeDefined();
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("findCategoryByName respeita o tipo", async () => {
    const t = await createTestDb();
    close = t.close;
    const { space } = await bootstrapUser(t.db, { whatsappNumber: "551177", name: "Ana" });
    await seedCategories(t.db, space.id);
    const asReceita = await findCategoryByName(t.db, space.id, "alimentacao", "receita");
    expect(asReceita).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @ia/db test categories`
Expected: FAIL — módulo `../src/repository/categories` não existe.

- [ ] **Step 3: Implementar `packages/db/src/repository/categories.ts`**

```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { categories } from "../schema";

export const DEFAULT_CATEGORIES = [
  { name: "alimentacao", type: "despesa" },
  { name: "transporte", type: "despesa" },
  { name: "moradia", type: "despesa" },
  { name: "lazer", type: "despesa" },
  { name: "saude", type: "despesa" },
  { name: "outros", type: "despesa" },
  { name: "salario", type: "receita" },
  { name: "outros", type: "receita" },
] as const;

export async function seedCategories(db: Db, spaceId: string): Promise<void> {
  await db.insert(categories).values(DEFAULT_CATEGORIES.map((c) => ({ ...c, spaceId })));
}

export async function findCategoryByName(
  db: Db,
  spaceId: string,
  name: string,
  type: "despesa" | "receita",
): Promise<{ id: string } | undefined> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.spaceId, spaceId), eq(categories.name, name), eq(categories.type, type)),
    )
    .limit(1);
  return rows[0];
}
```

- [ ] **Step 4: Exportar no barrel**

Adicionar a `packages/db/src/repository/index.ts`:

```ts
export * from "./users";
export * from "./categories";
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `pnpm --filter @ia/db test categories`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repository/categories.ts packages/db/src/repository/index.ts packages/db/test/categories.test.ts
git commit -m "feat(db): repository de categorias com seed padrao"
```

---

### Task 7: Repository de transações (insert em lote, listagem e somatórios por espaço)

A visibilidade vem da participação no espaço: listagens e somatórios abrangem as transações de **todos os membros** do espaço (via `created_by`).

**Files:**
- Create: `packages/db/src/repository/transactions.ts`
- Modify: `packages/db/src/repository/index.ts`
- Create: `packages/db/test/transactions.test.ts`

**Interfaces:**
- Consumes: `Db`, `schema`, `getSpaceMemberUserIds` (Task 5), `bootstrapUser` (Task 5), `seedCategories`/`findCategoryByName` (Task 6).
- Produces:
  - `type TransactionInput = { createdBy: string; type: "despesa" | "receita"; amount: string; categoryId?: string; description?: string; occurredAt: string; source: "texto" | "audio" | "foto" | "video" | "pdf" }`
  - `insertTransactions(db, inputs: TransactionInput[]): Promise<Transaction[]>`
  - `listTransactionsForSpace(db, spaceId, filters?: { from?: string; to?: string; type?: "despesa" | "receita" }): Promise<Transaction[]>`
  - `sumByCategory(db, spaceId, filters: { from: string; to: string; type: "despesa" | "receita" }): Promise<Array<{ categoryId: string | null; total: string }>>`

- [ ] **Step 1: Escrever o teste que falha**

`packages/db/test/transactions.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser, getSpaceMemberUserIds } from "../src/repository/users";
import { seedCategories, findCategoryByName } from "../src/repository/categories";
import {
  insertTransactions,
  listTransactionsForSpace,
  sumByCategory,
} from "../src/repository/transactions";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("transactions repository", () => {
  it("insere em lote e lista as transacoes do espaco", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "5511", name: "Lucas" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");

    await insertTransactions(t.db, [
      { createdBy: user.id, type: "despesa", amount: "50.00", categoryId: alim!.id, occurredAt: "2026-07-01", source: "texto" },
      { createdBy: user.id, type: "despesa", amount: "30.50", categoryId: alim!.id, occurredAt: "2026-07-02", source: "audio" },
    ]);

    const list = await listTransactionsForSpace(t.db, space.id);
    expect(list).toHaveLength(2);
    expect(list.map((x) => x.amount).sort()).toEqual(["30.50", "50.00"]);
  });

  it("somatorio por categoria abrange todos os membros do espaco", async () => {
    const t = await createTestDb();
    close = t.close;
    const a = await bootstrapUser(t.db, { whatsappNumber: "111", name: "A" });
    const b = await bootstrapUser(t.db, { whatsappNumber: "222", name: "B" });
    await seedCategories(t.db, a.space.id);
    const alim = await findCategoryByName(t.db, a.space.id, "alimentacao", "despesa");
    await t.db.insert((await import("../src/schema")).spaceMembers).values({ spaceId: a.space.id, userId: b.user.id, role: "member" });

    const members = await getSpaceMemberUserIds(t.db, a.space.id);
    expect(members.sort()).toEqual([a.user.id, b.user.id].sort());

    await insertTransactions(t.db, [
      { createdBy: a.user.id, type: "despesa", amount: "100.00", categoryId: alim!.id, occurredAt: "2026-07-10", source: "texto" },
      { createdBy: b.user.id, type: "despesa", amount: "40.00", categoryId: alim!.id, occurredAt: "2026-07-11", source: "texto" },
    ]);

    const totals = await sumByCategory(t.db, a.space.id, { from: "2026-07-01", to: "2026-07-31", type: "despesa" });
    expect(totals).toHaveLength(1);
    expect(totals[0].total).toBe("140.00");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @ia/db test transactions`
Expected: FAIL — módulo `../src/repository/transactions` não existe.

- [ ] **Step 3: Implementar `packages/db/src/repository/transactions.ts`**

```ts
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import { transactions, spaceMembers } from "../schema";
import type { Transaction } from "../types";

export type TransactionInput = {
  createdBy: string;
  type: "despesa" | "receita";
  amount: string;
  categoryId?: string;
  description?: string;
  occurredAt: string;
  source: "texto" | "audio" | "foto" | "video" | "pdf";
};

async function memberIds(db: Db, spaceId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, spaceId));
  return rows.map((r) => r.userId);
}

export async function insertTransactions(db: Db, inputs: TransactionInput[]): Promise<Transaction[]> {
  if (inputs.length === 0) return [];
  return db
    .insert(transactions)
    .values(
      inputs.map((i) => ({
        createdBy: i.createdBy,
        type: i.type,
        amount: i.amount,
        categoryId: i.categoryId ?? null,
        description: i.description ?? null,
        occurredAt: i.occurredAt,
        source: i.source,
      })),
    )
    .returning();
}

export async function listTransactionsForSpace(
  db: Db,
  spaceId: string,
  filters: { from?: string; to?: string; type?: "despesa" | "receita" } = {},
): Promise<Transaction[]> {
  const ids = await memberIds(db, spaceId);
  if (ids.length === 0) return [];
  const conds = [inArray(transactions.createdBy, ids)];
  if (filters.from) conds.push(gte(transactions.occurredAt, filters.from));
  if (filters.to) conds.push(lte(transactions.occurredAt, filters.to));
  if (filters.type) conds.push(eq(transactions.type, filters.type));
  return db.select().from(transactions).where(and(...conds));
}

export async function sumByCategory(
  db: Db,
  spaceId: string,
  filters: { from: string; to: string; type: "despesa" | "receita" },
): Promise<Array<{ categoryId: string | null; total: string }>> {
  const ids = await memberIds(db, spaceId);
  if (ids.length === 0) return [];
  return db
    .select({
      categoryId: transactions.categoryId,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.createdBy, ids),
        eq(transactions.type, filters.type),
        gte(transactions.occurredAt, filters.from),
        lte(transactions.occurredAt, filters.to),
      ),
    )
    .groupBy(transactions.categoryId);
}
```

- [ ] **Step 4: Exportar no barrel**

`packages/db/src/repository/index.ts`:

```ts
export * from "./users";
export * from "./categories";
export * from "./transactions";
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `pnpm --filter @ia/db test transactions`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repository/transactions.ts packages/db/src/repository/index.ts packages/db/test/transactions.test.ts
git commit -m "feat(db): repository de transacoes com listagem e somatorio por espaco"
```

---

### Task 8: Repository de convites (criar + aceitar com merge de espaço)

Aceitar um convite move a participação do convidado para o espaço compartilhado (modelo B). Como a transação pertence a `created_by` e não guarda `space_id`, os lançamentos passados do convidado passam a ser visíveis automaticamente.

**Files:**
- Create: `packages/db/src/repository/invitations.ts`
- Modify: `packages/db/src/repository/index.ts`
- Create: `packages/db/test/invitations.test.ts`

**Interfaces:**
- Consumes: `Db`, `schema`, `bootstrapUser` (Task 5), `getSpaceForUser`/`getSpaceMemberUserIds` (Task 5).
- Produces:
  - `createInvitation(db, input: { spaceId: string; invitedBy: string; invitedNumber: string }): Promise<Invitation>`
  - `getPendingInvitationsForNumber(db, whatsappNumber): Promise<Invitation[]>`
  - `acceptInvitation(db, invitationId: string, acceptingUserId: string): Promise<void>` — marca o convite como `accepted` e move a membership do usuário para o `spaceId` do convite, dentro de uma transação.

- [ ] **Step 1: Escrever o teste que falha**

`packages/db/test/invitations.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser, getSpaceForUser, getSpaceMemberUserIds } from "../src/repository/users";
import {
  createInvitation,
  getPendingInvitationsForNumber,
  acceptInvitation,
} from "../src/repository/invitations";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("invitations repository", () => {
  it("aceitar convite move o convidado para o espaco compartilhado", async () => {
    const t = await createTestDb();
    close = t.close;
    const owner = await bootstrapUser(t.db, { whatsappNumber: "111", name: "Lucas" });
    const guest = await bootstrapUser(t.db, { whatsappNumber: "222", name: "Ana" });

    const invite = await createInvitation(t.db, {
      spaceId: owner.space.id,
      invitedBy: owner.user.id,
      invitedNumber: "222",
    });

    const pending = await getPendingInvitationsForNumber(t.db, "222");
    expect(pending.map((p) => p.id)).toContain(invite.id);

    await acceptInvitation(t.db, invite.id, guest.user.id);

    const guestSpace = await getSpaceForUser(t.db, guest.user.id);
    expect(guestSpace?.id).toBe(owner.space.id);

    const members = await getSpaceMemberUserIds(t.db, owner.space.id);
    expect(members.sort()).toEqual([owner.user.id, guest.user.id].sort());

    const stillPending = await getPendingInvitationsForNumber(t.db, "222");
    expect(stillPending).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @ia/db test invitations`
Expected: FAIL — módulo `../src/repository/invitations` não existe.

- [ ] **Step 3: Implementar `packages/db/src/repository/invitations.ts`**

```ts
import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { invitations, spaceMembers } from "../schema";
import type { Invitation } from "../types";

export async function createInvitation(
  db: Db,
  input: { spaceId: string; invitedBy: string; invitedNumber: string },
): Promise<Invitation> {
  const [row] = await db
    .insert(invitations)
    .values({ spaceId: input.spaceId, invitedBy: input.invitedBy, invitedNumber: input.invitedNumber })
    .returning();
  return row;
}

export async function getPendingInvitationsForNumber(
  db: Db,
  whatsappNumber: string,
): Promise<Invitation[]> {
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.invitedNumber, whatsappNumber), eq(invitations.status, "pending")));
}

export async function acceptInvitation(
  db: Db,
  invitationId: string,
  acceptingUserId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .limit(1);
    if (!invite || invite.status !== "pending") {
      throw new Error("convite invalido ou ja respondido");
    }
    await tx.update(invitations).set({ status: "accepted" }).where(eq(invitations.id, invitationId));
    await tx.delete(spaceMembers).where(eq(spaceMembers.userId, acceptingUserId));
    await tx
      .insert(spaceMembers)
      .values({ spaceId: invite.spaceId, userId: acceptingUserId, role: "member" });
  });
}
```

- [ ] **Step 4: Exportar no barrel**

`packages/db/src/repository/index.ts`:

```ts
export * from "./users";
export * from "./categories";
export * from "./transactions";
export * from "./invitations";
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `pnpm --filter @ia/db test invitations`
Expected: PASS (1 teste).

- [ ] **Step 6: Rodar toda a suíte e a tipagem**

Run: `pnpm --filter @ia/db test && pnpm --filter @ia/db typecheck`
Expected: todos os testes PASS; sem erros de tipo.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/repository/invitations.ts packages/db/src/repository/index.ts packages/db/test/invitations.test.ts
git commit -m "feat(db): repository de convites com merge de espaco no aceite"
```

---

### Task 9: docker-compose do Postgres (dev) e verificação end-to-end de migrations

**Files:**
- Create: `docker-compose.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `DATABASE_URL`, migrations (Task 3+).
- Produces: Postgres local para desenvolvimento; comprovação de que as migrations aplicam num Postgres real (não só PGlite).

- [ ] **Step 1: Criar `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: ia
      POSTGRES_PASSWORD: ia
      POSTGRES_DB: ia_agent
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 2: Subir o Postgres**

Run: `docker compose up -d postgres`
Expected: container `postgres` de pé; `docker compose ps` mostra healthy/running.

- [ ] **Step 3: Aplicar as migrations no Postgres real**

Run: `DATABASE_URL=postgresql://ia:ia@localhost:5432/ia_agent pnpm --filter @ia/db db:migrate`
Expected: migrations aplicadas sem erro.

- [ ] **Step 4: Criar `README.md` com o passo a passo de setup**

```markdown
# ia-agent

Monorepo do agente financeiro de WhatsApp.

## Setup

1. `pnpm install`
2. `cp .env.example .env` e preencha `GOOGLE_GENERATIVE_AI_API_KEY`
3. `docker compose up -d postgres`
4. `pnpm --filter @ia/db db:migrate`
5. `pnpm test`

## Pacotes

- `packages/db` — schema Drizzle + repository (fonte única da verdade)
- `apps/agent` — agente Mastra + webhook do Evolution (plano futuro)
- `apps/web` — painel Next.js + auth OTP (plano futuro)
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml README.md
git commit -m "chore: docker-compose do postgres e readme de setup"
```

---

## Self-Review (feito pelo autor do plano)

**Cobertura do spec (Fase 0–1):**
- Monorepo pnpm + Turborepo → Task 1. ✔
- Validação áudio/vídeo Gemini via Mastra/AI SDK (risco nº 1) → Task 2. ✔
- Schema Postgres (users, spaces, space_members, invitations, categories, transactions) com `amount numeric` → Task 3. ✔
- Modelo B (transação por `created_by`, sem `space_id`; visibilidade por participação) → Tasks 3, 7, 8. ✔
- Bootstrap do primeiro contato (user + espaço pessoal + owner) → Task 5. ✔
- Categorias com seed inicial → Task 6. ✔
- Convite/aceite com merge de espaço → Task 8. ✔
- Postgres self-hosted via Docker → Task 9. ✔
- Testes com Gemini fora do caminho (repository testado com PGlite, sem API) → Tasks 4–8. ✔

**Fora deste plano (planos seguintes):** `apps/agent` (webhook Evolution + tools + Mastra Memory + idempotência de webhook), `apps/web` (Next.js + auth OTP Better Auth + telas de espaços/convites/gráficos), notificação de convite via WhatsApp. Motivo: são subsistemas independentes; cada um vira seu próprio plano sobre esta base.

**Placeholders:** nenhum — todos os steps trazem código e comandos reais.

**Consistência de tipos:** `Db`, `User`, `Space`, `Transaction`, `Invitation`, `TransactionInput` e as assinaturas do repository são referenciadas de forma idêntica entre as tasks e os blocos de Interfaces.
