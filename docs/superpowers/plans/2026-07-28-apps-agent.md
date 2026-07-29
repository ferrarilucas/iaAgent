# apps/agent — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o `apps/agent`: um serviço que recebe mensagens do WhatsApp via Evolution API, usa o Gemini (multimodal) através do Mastra para entender e agir sobre finanças, registra/consulta via `packages/db`, corrige/apaga o último lançamento, e responde no chat.

**Architecture:** Um servidor Hono (mesmo runtime que o Mastra usa) expõe `POST /webhook`, responde 200 imediatamente e processa em background. O processamento identifica o usuário pelo número, extrai a mídia via Evolution, invoca um Mastra Agent (Gemini 2.5 Flash) com tools Zod que chamam o repository do `packages/db`, e devolve a resposta pelo Evolution. Idempotência por `key.id` numa tabela `processed_messages`.

**Tech Stack:** Node 20+, pnpm, TypeScript strict, Hono + @hono/node-server, @mastra/core (Agent + tools), @mastra/memory, @ai-sdk/google (Gemini 2.5 Flash), Zod, Vitest, `@ia/db` (workspace).

## Global Constraints

- **NUNCA adicionar comentários no código** — nem inline, nem de bloco, em nenhum arquivo `.ts`/config. Regra do dono do projeto.
- **TypeScript strict** em todo o pacote.
- **Dinheiro é string** (`numeric(14,2)`); nunca converter `amount` para `number`/float.
- **Segredos só via env** — `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DATABASE_URL`. Nunca hardcodar. A config valida a presença delas na inicialização (zod).
- **`amount` e datas**: `occurredAt` no formato `YYYY-MM-DD` (coluna `date`).
- **Reconciliação de versões (Mastra/AI SDK):** as APIs do Mastro (`Agent`, `createTool`, `Memory`) e do `@ai-sdk/google` evoluem rápido. O código deste plano reflete o uso correto conhecido; se a versão instalada divergir na assinatura, ajuste minimamente para a API real da versão fixada, **mantendo os nomes de tools, arquivos e assinaturas exportadas** que este plano define. Registre qualquer ajuste no report da tarefa.
- **Testes não gastam API real** — Gemini e Evolution sempre mockados nos testes; o banco usa PGlite.
- Commits frequentes, um por tarefa, mensagens `tipo(escopo): descrição`.

---

## Estrutura de arquivos (o que este plano cria)

```
iaAgent/
  spikes/gemini-multimodal.ts          (Task 0 — validação do risco nº 1)
  packages/db/                         (Task 2 — funções e tabela novas)
    src/schema.ts                      + processedMessages
    src/repository/transactions.ts     + updateTransaction, deleteTransaction, getLastTransactionForUser
    src/repository/messages.ts         (novo) isMessageProcessed, markMessageProcessed
    migrations/                        nova migration gerada
  apps/agent/
    package.json
    tsconfig.json
    vitest.config.ts
    src/
      config.ts                        env validado (zod)
      server.ts                        Hono app + rota /webhook + start
      webhook/
        evolution.ts                   parse MESSAGES_UPSERT, fetch de mídia, sendText
        handler.ts                     idempotência, 200 imediato, processamento async
      agent/
        tools.ts                       tools Zod -> packages/db
        agent.ts                       Mastra Agent (Gemini) + persona
        memory.ts                      Mastra Memory (Postgres)
        process-message.ts             orquestra: identifica user, roda agent, responde
    test/
      evolution.test.ts
      tools.test.ts
      handler.test.ts
```

---

### Task 0: Spike — validar multimodal do Gemini (áudio/vídeo)

De-risca o pressuposto central (Gemini lê áudio/vídeo via AI SDK) antes de construir o agente. **Requer a chave real do Gemini e um áudio gravado — passo humano; não é executável por um agente autônomo.**

**Files:**
- Create: `spikes/gemini-multimodal.ts`
- Create: `spikes/package.json`

**Interfaces:**
- Consumes: `GOOGLE_GENERATIVE_AI_API_KEY`.
- Produces: evidência (console) de que o Gemini transcreve/interpreta um áudio. Nenhum código de produção depende disto.

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
          { type: "text", text: "Transcreva este audio e extraia valor, categoria e data se houver um gasto." },
          { type: "file", mediaType: "audio/ogg", data: audio },
        ],
      },
    ],
  });
  console.log(result.text);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Instalar e rodar com um áudio real (passo humano)**

Run: `cd spikes && pnpm install && GOOGLE_GENERATIVE_AI_API_KEY=<chave> pnpm run run teste.ogg`
Expected: saída contém a transcrição e o valor/categoria/data extraídos.

- [ ] **Step 4: Registrar decisão e commit**

Se PASSOU: segue com Mastra/AI SDK para todas as mídias. Se FALHOU para áudio/vídeo: anotar no report e no spec (Riscos) que áudio/vídeo usará o Gemini SDK direto no `evolution.ts`/`process-message.ts`.

```bash
git add spikes/
git commit -m "spike: valida multimodal (audio) do gemini via ai-sdk"
```

---

### Task 2: `packages/db` — update/delete/last transaction, tabela processed_messages

TDD. Adiciona as funções e a tabela que o agente precisa. (Task 1 é o scaffolding do app; esta tarefa vem antes para o agente já ter o que consumir — a numeração segue a ordem lógica de dependência.)

**Files:**
- Modify: `packages/db/src/schema.ts` (adicionar `processedMessages`)
- Modify: `packages/db/src/repository/transactions.ts` (3 funções novas)
- Create: `packages/db/src/repository/messages.ts`
- Modify: `packages/db/src/repository/index.ts`
- Modify: `packages/db/src/types.ts` (tipo `ProcessedMessage` opcional)
- Create: `packages/db/test/transactions-mutations.test.ts`
- Create: `packages/db/test/messages.test.ts`
- Generate: nova migration

**Interfaces:**
- Consumes: schema/harness existentes; `bootstrapUser`, `insertTransactions`, `TransactionInput`.
- Produces:
  - `updateTransaction(db, id, patch: Partial<{ type; amount; categoryId; description; occurredAt; source }>): Promise<Transaction | undefined>`
  - `deleteTransaction(db, id): Promise<void>`
  - `getLastTransactionForUser(db, userId): Promise<Transaction | undefined>`
  - `isMessageProcessed(db, messageId): Promise<boolean>`
  - `markMessageProcessed(db, messageId): Promise<void>`

- [ ] **Step 1: Adicionar a tabela em `schema.ts`**

```ts
export const processedMessages = pgTable("processed_messages", {
  messageId: text("message_id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Gerar a migration**

Run: `pnpm --filter @ia/db db:generate`
Expected: nova migration `000X_*.sql` criando `processed_messages`.

- [ ] **Step 3: Escrever o teste de mutações — `packages/db/test/transactions-mutations.test.ts`**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { seedCategories, findCategoryByName } from "../src/repository/categories";
import { insertTransactions } from "../src/repository/transactions";
import { updateTransaction, deleteTransaction, getLastTransactionForUser } from "../src/repository/transactions";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("transactions mutations", () => {
  it("getLastTransactionForUser retorna a mais recente", async () => {
    const t = await createTestDb(); close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "51", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");
    await insertTransactions(t.db, [
      { createdBy: user.id, type: "despesa", amount: "10.00", categoryId: alim!.id, occurredAt: "2026-07-01", source: "texto" },
      { createdBy: user.id, type: "despesa", amount: "20.00", categoryId: alim!.id, occurredAt: "2026-07-02", source: "texto" },
    ]);
    const last = await getLastTransactionForUser(t.db, user.id);
    expect(last?.amount).toBe("20.00");
  });

  it("updateTransaction altera campos e deleteTransaction remove", async () => {
    const t = await createTestDb(); close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "52", name: "L" });
    await seedCategories(t.db, space.id);
    const alim = await findCategoryByName(t.db, space.id, "alimentacao", "despesa");
    const transp = await findCategoryByName(t.db, space.id, "transporte", "despesa");
    const [tx] = await insertTransactions(t.db, [
      { createdBy: user.id, type: "despesa", amount: "50.00", categoryId: alim!.id, occurredAt: "2026-07-03", source: "texto" },
    ]);
    const updated = await updateTransaction(t.db, tx.id, { categoryId: transp!.id, amount: "55.00" });
    expect(updated?.categoryId).toBe(transp!.id);
    expect(updated?.amount).toBe("55.00");
    await deleteTransaction(t.db, tx.id);
    expect(await getLastTransactionForUser(t.db, user.id)).toBeUndefined();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @ia/db test transactions-mutations`
Expected: FAIL — funções não existem.

- [ ] **Step 5: Implementar as funções em `packages/db/src/repository/transactions.ts`**

Adicionar ao final do arquivo (mantendo os imports; adicionar `desc` ao import de `drizzle-orm`):

```ts
export async function updateTransaction(
  db: Db,
  id: string,
  patch: Partial<{
    type: "despesa" | "receita";
    amount: string;
    categoryId: string;
    description: string;
    occurredAt: string;
    source: "texto" | "audio" | "foto" | "video" | "pdf";
  }>,
): Promise<Transaction | undefined> {
  const [row] = await db.update(transactions).set(patch).where(eq(transactions.id, id)).returning();
  return row;
}

export async function deleteTransaction(db: Db, id: string): Promise<void> {
  await db.delete(transactions).where(eq(transactions.id, id));
}

export async function getLastTransactionForUser(db: Db, userId: string): Promise<Transaction | undefined> {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.createdBy, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(1);
  return rows[0];
}
```

- [ ] **Step 6: Escrever o teste de mensagens — `packages/db/test/messages.test.ts`**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { isMessageProcessed, markMessageProcessed } from "../src/repository/messages";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("processed messages", () => {
  it("marca e detecta idempotencia", async () => {
    const t = await createTestDb(); close = t.close;
    expect(await isMessageProcessed(t.db, "ABC")).toBe(false);
    await markMessageProcessed(t.db, "ABC");
    expect(await isMessageProcessed(t.db, "ABC")).toBe(true);
  });

  it("markMessageProcessed e idempotente (nao lanca em duplicata)", async () => {
    const t = await createTestDb(); close = t.close;
    await markMessageProcessed(t.db, "X");
    await markMessageProcessed(t.db, "X");
    expect(await isMessageProcessed(t.db, "X")).toBe(true);
  });
});
```

- [ ] **Step 7: Implementar `packages/db/src/repository/messages.ts`**

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { processedMessages } from "../schema";

export async function isMessageProcessed(db: Db, messageId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(processedMessages)
    .where(eq(processedMessages.messageId, messageId))
    .limit(1);
  return rows.length > 0;
}

export async function markMessageProcessed(db: Db, messageId: string): Promise<void> {
  await db.insert(processedMessages).values({ messageId }).onConflictDoNothing();
}
```

- [ ] **Step 8: Exportar no barrel — adicionar a `packages/db/src/repository/index.ts`**

```ts
export * from "./messages";
```

- [ ] **Step 9: Rodar tudo**

Run: `pnpm --filter @ia/db test && pnpm --filter @ia/db typecheck`
Expected: toda a suíte passa (incluindo os novos testes).

- [ ] **Step 10: Commit**

```bash
git add packages/db
git commit -m "feat(db): update/delete/last transaction e tabela processed_messages"
```

---

### Task 1: Scaffolding do `apps/agent` + config

**Files:**
- Create: `apps/agent/package.json`
- Create: `apps/agent/tsconfig.json`
- Create: `apps/agent/vitest.config.ts`
- Create: `apps/agent/src/config.ts`

**Interfaces:**
- Consumes: env vars.
- Produces: `loadConfig(): AppConfig` — objeto validado com `evolutionApiUrl`, `evolutionInstance`, `evolutionApiKey`, `googleApiKey`, `databaseUrl`, `port`.

- [ ] **Step 1: Criar `apps/agent/package.json`**

```json
{
  "name": "@ia/agent",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@ai-sdk/google": "^1.0.0",
    "@hono/node-server": "^1.13.0",
    "@ia/db": "workspace:*",
    "@mastra/core": "^0.10.0",
    "@mastra/memory": "^0.10.0",
    "@mastra/pg": "^0.10.0",
    "hono": "^4.6.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Criar `apps/agent/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Criar `apps/agent/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 4: Criar `apps/agent/src/config.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_INSTANCE: z.string().min(1),
  EVOLUTION_API_KEY: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3001),
});

export type AppConfig = {
  evolutionApiUrl: string;
  evolutionInstance: string;
  evolutionApiKey: string;
  googleApiKey: string;
  databaseUrl: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.parse(env);
  return {
    evolutionApiUrl: parsed.EVOLUTION_API_URL,
    evolutionInstance: parsed.EVOLUTION_INSTANCE,
    evolutionApiKey: parsed.EVOLUTION_API_KEY,
    googleApiKey: parsed.GOOGLE_GENERATIVE_AI_API_KEY,
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.PORT,
  };
}
```

- [ ] **Step 5: Instalar e typecheck**

Run: `pnpm install && pnpm --filter @ia/agent typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/package.json apps/agent/tsconfig.json apps/agent/vitest.config.ts apps/agent/src/config.ts pnpm-lock.yaml
git commit -m "feat(agent): scaffolding do app e config validada"
```

---

### Task 3: Gateway do Evolution (`evolution.ts`)

TDD. Parse do `MESSAGES_UPSERT`, obtenção de mídia (adaptador base64), e envio de texto. HTTP mockado nos testes.

**Files:**
- Create: `apps/agent/src/webhook/evolution.ts`
- Create: `apps/agent/test/evolution.test.ts`

**Interfaces:**
- Consumes: `AppConfig` (Task 1).
- Produces:
  - `type IncomingMessage = { messageId: string; fromNumber: string; fromMe: boolean; pushName?: string; kind: "texto" | "audio" | "foto" | "video" | "pdf" | "unsupported"; text?: string; media?: { mediaType: string; base64: string } }`
  - `parseUpsert(payload: unknown): IncomingMessage | null`
  - `fetchMediaBase64(config: AppConfig, messageId: string): Promise<string>`
  - `sendText(config: AppConfig, toNumber: string, text: string): Promise<void>`

- [ ] **Step 1: Escrever o teste — `apps/agent/test/evolution.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { parseUpsert, sendText } from "../src/webhook/evolution";
import type { AppConfig } from "../src/config";

const config: AppConfig = {
  evolutionApiUrl: "https://evo.example",
  evolutionInstance: "inst",
  evolutionApiKey: "key",
  googleApiKey: "g",
  databaseUrl: "d",
  port: 3001,
};

afterEach(() => vi.restoreAllMocks());

describe("parseUpsert", () => {
  it("extrai texto de conversation", () => {
    const msg = parseUpsert({
      data: { key: { remoteJid: "5511999@s.whatsapp.net", fromMe: false, id: "M1" }, pushName: "Lucas", message: { conversation: "gastei 50 no almoco" } },
    });
    expect(msg).toMatchObject({ messageId: "M1", fromNumber: "5511999", fromMe: false, kind: "texto", text: "gastei 50 no almoco" });
  });

  it("marca audio como kind audio", () => {
    const msg = parseUpsert({
      data: { key: { remoteJid: "5511999@s.whatsapp.net", fromMe: false, id: "M2" }, message: { audioMessage: { mimetype: "audio/ogg" } } },
    });
    expect(msg?.kind).toBe("audio");
  });

  it("retorna null para payload sem data.key", () => {
    expect(parseUpsert({ foo: 1 })).toBeNull();
  });
});

describe("sendText", () => {
  it("faz POST no endpoint sendText com apikey e number", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
    await sendText(config, "5511999", "ok");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://evo.example/message/sendText/inst");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.apikey).toBe("key");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ number: "5511999", text: "ok" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ia/agent test evolution`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `apps/agent/src/webhook/evolution.ts`**

```ts
import type { AppConfig } from "../config";

export type IncomingMessage = {
  messageId: string;
  fromNumber: string;
  fromMe: boolean;
  pushName?: string;
  kind: "texto" | "audio" | "foto" | "video" | "pdf" | "unsupported";
  text?: string;
  media?: { mediaType: string; base64: string };
};

function numberFromJid(jid: string): string {
  return jid.split("@")[0].split(":")[0];
}

export function parseUpsert(payload: unknown): IncomingMessage | null {
  const data = (payload as { data?: any })?.data;
  const key = data?.key;
  if (!data || !key || typeof key.id !== "string" || typeof key.remoteJid !== "string") return null;
  const base = {
    messageId: key.id as string,
    fromNumber: numberFromJid(key.remoteJid),
    fromMe: Boolean(key.fromMe),
    pushName: typeof data.pushName === "string" ? data.pushName : undefined,
  };
  const message = data.message ?? {};
  if (typeof message.conversation === "string") {
    return { ...base, kind: "texto", text: message.conversation };
  }
  if (typeof message.extendedTextMessage?.text === "string") {
    return { ...base, kind: "texto", text: message.extendedTextMessage.text };
  }
  if (message.audioMessage) return { ...base, kind: "audio" };
  if (message.imageMessage) return { ...base, kind: "foto", text: message.imageMessage.caption };
  if (message.videoMessage) return { ...base, kind: "video", text: message.videoMessage.caption };
  if (message.documentMessage) return { ...base, kind: "pdf", text: message.documentMessage.caption };
  return { ...base, kind: "unsupported" };
}

export async function fetchMediaBase64(config: AppConfig, messageId: string): Promise<string> {
  const res = await fetch(
    `${config.evolutionApiUrl}/chat/getBase64FromMediaMessage/${config.evolutionInstance}`,
    {
      method: "POST",
      headers: { apikey: config.evolutionApiKey, "content-type": "application/json" },
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
    },
  );
  if (!res.ok) throw new Error(`evolution getBase64 ${res.status}`);
  const json = (await res.json()) as { base64?: string };
  if (!json.base64) throw new Error("evolution getBase64 sem base64");
  return json.base64;
}

export async function sendText(config: AppConfig, toNumber: string, text: string): Promise<void> {
  const res = await fetch(`${config.evolutionApiUrl}/message/sendText/${config.evolutionInstance}`, {
    method: "POST",
    headers: { apikey: config.evolutionApiKey, "content-type": "application/json" },
    body: JSON.stringify({ number: toNumber, text }),
  });
  if (!res.ok) throw new Error(`evolution sendText ${res.status}`);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ia/agent test evolution`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/webhook/evolution.ts apps/agent/test/evolution.test.ts
git commit -m "feat(agent): gateway do evolution (parse, midia, sendText)"
```

---

### Task 4: Mastra Agent, tools e memória

TDD nas tools (o Gemini não entra aqui — as tools são funções puras que chamam o banco). O agent/memory são a fiação (verificada por typecheck + o teste de integração da Task 5).

**Files:**
- Create: `apps/agent/src/agent/tools.ts`
- Create: `apps/agent/src/agent/memory.ts`
- Create: `apps/agent/src/agent/agent.ts`
- Create: `apps/agent/test/tools.test.ts`

**Interfaces:**
- Consumes: `@ia/db` (repository: `insertTransactions`, `listTransactionsForSpace`, `sumByCategory`, `getSpaceForUser`, `findCategoryByName`, `getLastTransactionForUser`, `updateTransaction`, `deleteTransaction`), `Db`.
- Produces:
  - `createTools(db: Db, userId: string, spaceId: string)` — retorna um objeto de tools Mastra: `registrar_transacao`, `consultar_transacoes`, `resumo`, `corrigir_ultima_transacao`, `apagar_ultima_transacao`.
  - `buildAgent(config, tools)` — retorna um Mastra Agent configurado com Gemini 2.5 Flash, persona e memória.
  - `registrarTransacaoImpl(db, { userId, spaceId, itens })` e as demais `*Impl` funções puras testáveis (as tools são finas sobre elas).

- [ ] **Step 1: Escrever o teste das implementações — `apps/agent/test/tools.test.ts`**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "@ia/db/test/helpers";
import { bootstrapUser, seedCategories } from "@ia/db";
import {
  registrarTransacaoImpl,
  resumoImpl,
  corrigirUltimaImpl,
  apagarUltimaImpl,
} from "../src/agent/tools";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

async function setup() {
  const t = await createTestDb(); close = t.close;
  const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "5599", name: "L" });
  await seedCategories(t.db, space.id);
  return { db: t.db, userId: user.id, spaceId: space.id };
}

describe("tools impl", () => {
  it("registrar cria lancamento resolvendo categoria por nome", async () => {
    const { db, userId, spaceId } = await setup();
    const res = await registrarTransacaoImpl(db, {
      userId, spaceId,
      itens: [{ type: "despesa", amount: "50.00", categoria: "alimentacao", occurredAt: "2026-07-05", source: "texto" }],
    });
    expect(res.criadas).toBe(1);
    const resumo = await resumoImpl(db, { spaceId, from: "2026-07-01", to: "2026-07-31", type: "despesa" });
    expect(resumo.total).toBe("50.00");
  });

  it("corrigir e apagar agem sobre o ultimo lancamento", async () => {
    const { db, userId, spaceId } = await setup();
    await registrarTransacaoImpl(db, { userId, spaceId, itens: [{ type: "despesa", amount: "50.00", categoria: "alimentacao", occurredAt: "2026-07-05", source: "texto" }] });
    const corr = await corrigirUltimaImpl(db, { userId, spaceId, categoria: "transporte" });
    expect(corr.ok).toBe(true);
    const del = await apagarUltimaImpl(db, { userId });
    expect(del.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ia/agent test tools`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar as funções puras + tools em `apps/agent/src/agent/tools.ts`**

```ts
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { Db } from "@ia/db";
import {
  insertTransactions,
  listTransactionsForSpace,
  sumByCategory,
  findCategoryByName,
  getLastTransactionForUser,
  updateTransaction,
  deleteTransaction,
} from "@ia/db";

const itemSchema = z.object({
  type: z.enum(["despesa", "receita"]),
  amount: z.string(),
  categoria: z.string(),
  description: z.string().optional(),
  occurredAt: z.string(),
  source: z.enum(["texto", "audio", "foto", "video", "pdf"]),
});

async function resolveCategoria(db: Db, spaceId: string, nome: string, type: "despesa" | "receita") {
  const found = await findCategoryByName(db, spaceId, nome, type);
  if (found) return found.id;
  const fallback = await findCategoryByName(db, spaceId, "outros", type);
  return fallback?.id;
}

export async function registrarTransacaoImpl(
  db: Db,
  input: { userId: string; spaceId: string; itens: Array<z.infer<typeof itemSchema>> },
): Promise<{ criadas: number }> {
  const inputs = [];
  for (const it of input.itens) {
    const categoryId = await resolveCategoria(db, input.spaceId, it.categoria, it.type);
    inputs.push({
      createdBy: input.userId,
      type: it.type,
      amount: it.amount,
      categoryId,
      description: it.description,
      occurredAt: it.occurredAt,
      source: it.source,
    });
  }
  const rows = await insertTransactions(db, inputs);
  return { criadas: rows.length };
}

export async function consultarImpl(
  db: Db,
  input: { spaceId: string; from?: string; to?: string; type?: "despesa" | "receita" },
) {
  const rows = await listTransactionsForSpace(db, input.spaceId, { from: input.from, to: input.to, type: input.type });
  return { itens: rows.map((r) => ({ amount: r.amount, occurredAt: r.occurredAt, description: r.description })) };
}

export async function resumoImpl(
  db: Db,
  input: { spaceId: string; from: string; to: string; type: "despesa" | "receita" },
): Promise<{ total: string; porCategoria: Array<{ categoryId: string | null; total: string }> }> {
  const porCategoria = await sumByCategory(db, input.spaceId, { from: input.from, to: input.to, type: input.type });
  const total = porCategoria.reduce((acc, r) => acc + Number(r.total), 0).toFixed(2);
  return { total, porCategoria };
}

export async function corrigirUltimaImpl(
  db: Db,
  input: { userId: string; spaceId: string; type?: "despesa" | "receita"; amount?: string; categoria?: string; description?: string; occurredAt?: string },
): Promise<{ ok: boolean }> {
  const last = await getLastTransactionForUser(db, input.userId);
  if (!last) return { ok: false };
  const patch: Record<string, unknown> = {};
  if (input.amount) patch.amount = input.amount;
  if (input.description) patch.description = input.description;
  if (input.occurredAt) patch.occurredAt = input.occurredAt;
  if (input.type) patch.type = input.type;
  if (input.categoria) {
    const categoryId = await resolveCategoria(db, input.spaceId, input.categoria, input.type ?? last.type);
    patch.categoryId = categoryId;
  }
  await updateTransaction(db, last.id, patch);
  return { ok: true };
}

export async function apagarUltimaImpl(db: Db, input: { userId: string }): Promise<{ ok: boolean }> {
  const last = await getLastTransactionForUser(db, input.userId);
  if (!last) return { ok: false };
  await deleteTransaction(db, last.id);
  return { ok: true };
}

export function createTools(db: Db, userId: string, spaceId: string) {
  return {
    registrar_transacao: createTool({
      id: "registrar_transacao",
      description: "Registra um ou mais lancamentos financeiros (despesa ou receita).",
      inputSchema: z.object({ itens: z.array(itemSchema) }),
      execute: async ({ context }) => registrarTransacaoImpl(db, { userId, spaceId, itens: context.itens }),
    }),
    consultar_transacoes: createTool({
      id: "consultar_transacoes",
      description: "Lista lancamentos do espaco com filtros opcionais de periodo e tipo.",
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        type: z.enum(["despesa", "receita"]).optional(),
      }),
      execute: async ({ context }) => consultarImpl(db, { spaceId, ...context }),
    }),
    resumo: createTool({
      id: "resumo",
      description: "Soma por categoria em um periodo, por tipo.",
      inputSchema: z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(["despesa", "receita"]),
      }),
      execute: async ({ context }) => resumoImpl(db, { spaceId, ...context }),
    }),
    corrigir_ultima_transacao: createTool({
      id: "corrigir_ultima_transacao",
      description: "Corrige o ultimo lancamento do usuario (categoria, valor, tipo, data ou descricao).",
      inputSchema: z.object({
        type: z.enum(["despesa", "receita"]).optional(),
        amount: z.string().optional(),
        categoria: z.string().optional(),
        description: z.string().optional(),
        occurredAt: z.string().optional(),
      }),
      execute: async ({ context }) => corrigirUltimaImpl(db, { userId, spaceId, ...context }),
    }),
    apagar_ultima_transacao: createTool({
      id: "apagar_ultima_transacao",
      description: "Apaga o ultimo lancamento do usuario.",
      inputSchema: z.object({}),
      execute: async () => apagarUltimaImpl(db, { userId }),
    }),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @ia/agent test tools`
Expected: PASS (2 testes). Se o `createTool` da versão instalada divergir na assinatura do `execute` (ex: `({ context })` vs `(input)`), ajuste conforme a API real e mantenha as funções `*Impl` intactas (elas são o que o teste cobre).

- [ ] **Step 5: Implementar `apps/agent/src/agent/memory.ts`**

```ts
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import type { AppConfig } from "../config";

export function buildMemory(config: AppConfig): Memory {
  return new Memory({
    storage: new PostgresStore({ connectionString: config.databaseUrl }),
    options: { lastMessages: 10 },
  });
}
```

- [ ] **Step 6: Implementar `apps/agent/src/agent/agent.ts`**

```ts
import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import type { Memory } from "@mastra/memory";
import type { createTools } from "./tools";

const PERSONA = [
  "Voce e um assistente financeiro pessoal no WhatsApp, direto e amigavel, em portugues do Brasil.",
  "Respostas curtas. Quando registrar um lancamento, confirme com o valor, a categoria e a data.",
  "Se a mensagem for ambigua (ex: valor faltando), pergunte antes de registrar.",
  "Se a pergunta nao for financeira, recuse educadamente e reconduza ao controle financeiro.",
  "A data de hoje deve ser usada quando o usuario disser 'hoje'. Use o formato YYYY-MM-DD nas datas.",
].join(" ");

export function buildAgent(memory: Memory, tools: ReturnType<typeof createTools>): Agent {
  return new Agent({
    name: "assistente-financeiro",
    instructions: PERSONA,
    model: google("gemini-2.5-flash"),
    tools,
    memory,
  });
}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @ia/agent typecheck`
Expected: sem erros (ajuste a fiação Mastra à versão instalada se necessário, mantendo assinaturas exportadas).

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/agent apps/agent/test/tools.test.ts
git commit -m "feat(agent): tools, memoria e mastra agent (gemini)"
```

---

### Task 5: Handler do webhook, processamento e servidor

Junta tudo: idempotência, 200 imediato, bootstrap de primeiro contato, mídia, invocação do agent, resposta. Teste de integração com Evolution e Gemini mockados.

**Files:**
- Create: `apps/agent/src/agent/process-message.ts`
- Create: `apps/agent/src/webhook/handler.ts`
- Create: `apps/agent/src/server.ts`
- Create: `apps/agent/test/handler.test.ts`

**Interfaces:**
- Consumes: `parseUpsert`, `fetchMediaBase64`, `sendText` (Task 3); `createTools`, `buildAgent`, `buildMemory` (Task 4); `@ia/db` (`createClient`, `getUserByWhatsappNumber`, `bootstrapUser`, `seedCategories`, `getSpaceForUser`, `isMessageProcessed`, `markMessageProcessed`).
- Produces:
  - `processMessage(deps, incoming): Promise<void>` — todo o processamento de uma mensagem já parseada (identifica/bootstrap do user, monta tools, roda o agent, responde). `deps` injeta `db`, `config`, `runAgent` e `sendText` para permitir mock nos testes.
  - `createApp(deps)` — retorna o app Hono com `POST /webhook` e `GET /health`.

- [ ] **Step 1: Escrever o teste de integração — `apps/agent/test/handler.test.ts`**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestDb } from "@ia/db/test/helpers";
import { getUserByWhatsappNumber, listTransactionsForSpace, getSpaceForUser } from "@ia/db";
import { processMessage } from "../src/agent/process-message";
import type { IncomingMessage } from "../src/webhook/evolution";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); vi.restoreAllMocks(); });

describe("processMessage", () => {
  it("faz bootstrap no primeiro contato e registra via agent", async () => {
    const t = await createTestDb(); close = t.close;
    const sent: string[] = [];
    const runAgent = vi.fn(async ({ db, userId, spaceId }: any) => {
      const { registrarTransacaoImpl } = await import("../src/agent/tools");
      await registrarTransacaoImpl(db, { userId, spaceId, itens: [{ type: "despesa", amount: "50.00", categoria: "alimentacao", occurredAt: "2026-07-05", source: "texto" }] });
      return "Registrado: R$50 alimentacao";
    });
    const sendText = vi.fn(async (_n: string, text: string) => { sent.push(text); });

    const incoming: IncomingMessage = { messageId: "M1", fromNumber: "5511", fromMe: false, pushName: "Lucas", kind: "texto", text: "gastei 50 no almoco" };
    await processMessage({ db: t.db, runAgent, sendText }, incoming);

    const user = await getUserByWhatsappNumber(t.db, "5511");
    expect(user).toBeDefined();
    const space = await getSpaceForUser(t.db, user!.id);
    const txs = await listTransactionsForSpace(t.db, space!.id);
    expect(txs).toHaveLength(1);
    expect(sent[0]).toContain("Registrado");
  });

  it("ignora mensagem duplicada (idempotencia)", async () => {
    const t = await createTestDb(); close = t.close;
    const runAgent = vi.fn(async () => "ok");
    const sendText = vi.fn(async () => {});
    const incoming: IncomingMessage = { messageId: "DUP", fromNumber: "5511", fromMe: false, kind: "texto", text: "oi" };
    await processMessage({ db: t.db, runAgent, sendText }, incoming);
    await processMessage({ db: t.db, runAgent, sendText }, incoming);
    expect(runAgent).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @ia/agent test handler`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `apps/agent/src/agent/process-message.ts`**

```ts
import type { Db } from "@ia/db";
import {
  getUserByWhatsappNumber,
  bootstrapUser,
  seedCategories,
  getSpaceForUser,
  isMessageProcessed,
  markMessageProcessed,
} from "@ia/db";
import type { IncomingMessage } from "../webhook/evolution";

export type RunAgentArgs = {
  db: Db;
  userId: string;
  spaceId: string;
  threadId: string;
  incoming: IncomingMessage;
};

export type ProcessDeps = {
  db: Db;
  runAgent: (args: RunAgentArgs) => Promise<string>;
  sendText: (toNumber: string, text: string) => Promise<void>;
};

export async function processMessage(deps: ProcessDeps, incoming: IncomingMessage): Promise<void> {
  if (incoming.fromMe) return;
  if (await isMessageProcessed(deps.db, incoming.messageId)) return;
  await markMessageProcessed(deps.db, incoming.messageId);

  if (incoming.kind === "unsupported") {
    await deps.sendText(incoming.fromNumber, "Por enquanto eu entendo texto, audio, foto, video e PDF. Pode mandar assim?");
    return;
  }

  let user = await getUserByWhatsappNumber(deps.db, incoming.fromNumber);
  let spaceId: string;
  const firstContact = !user;
  if (!user) {
    const created = await bootstrapUser(deps.db, { whatsappNumber: incoming.fromNumber, name: incoming.pushName });
    await seedCategories(deps.db, created.space.id);
    user = created.user;
    spaceId = created.space.id;
  } else {
    const space = await getSpaceForUser(deps.db, user.id);
    if (!space) {
      const created = await bootstrapUser(deps.db, { whatsappNumber: incoming.fromNumber, name: incoming.pushName });
      spaceId = created.space.id;
    } else {
      spaceId = space.id;
    }
  }

  if (firstContact) {
    await deps.sendText(
      incoming.fromNumber,
      "Oi! Sou seu assistente financeiro. Me manda seus gastos por texto, audio, foto ou PDF (ex: 'gastei 50 no almoco') que eu registro. Pergunte tambem 'quanto gastei em alimentacao esse mes?'.",
    );
  }

  const reply = await deps.runAgent({
    db: deps.db,
    userId: user.id,
    spaceId,
    threadId: incoming.fromNumber,
    incoming,
  });

  await deps.sendText(incoming.fromNumber, reply);
}
```

- [ ] **Step 4: Implementar `apps/agent/src/webhook/handler.ts`**

```ts
import type { Db } from "@ia/db";
import type { AppConfig } from "../config";
import { parseUpsert, fetchMediaBase64, sendText, type IncomingMessage } from "./evolution";
import { createTools } from "../agent/tools";
import { buildAgent } from "../agent/agent";
import { buildMemory } from "../agent/memory";
import { processMessage } from "../agent/process-message";
import { google } from "@ai-sdk/google";

const MEDIA_MIME: Record<string, string> = {
  audio: "audio/ogg",
  foto: "image/jpeg",
  video: "video/mp4",
  pdf: "application/pdf",
};

export function createHandlerDeps(db: Db, config: AppConfig) {
  const memory = buildMemory(config);
  const runAgent = async (args: {
    db: Db;
    userId: string;
    spaceId: string;
    threadId: string;
    incoming: IncomingMessage;
  }): Promise<string> => {
    const tools = createTools(args.db, args.userId, args.spaceId);
    const agent = buildAgent(memory, tools);
    const content: any[] = [{ type: "text", text: args.incoming.text ?? "" }];
    if (args.incoming.kind !== "texto") {
      const base64 = await fetchMediaBase64(config, args.incoming.messageId);
      content.push({ type: "file", mediaType: MEDIA_MIME[args.incoming.kind], data: base64 });
    }
    const res = await agent.generate([{ role: "user", content }], {
      threadId: args.threadId,
      resourceId: args.threadId,
    });
    return res.text;
  };
  return {
    db,
    runAgent,
    sendText: (toNumber: string, text: string) => sendText(config, toNumber, text),
  };
}

export function handleUpsert(deps: ReturnType<typeof createHandlerDeps>, payload: unknown): void {
  const incoming = parseUpsert(payload);
  if (!incoming) return;
  void processMessage(deps, incoming).catch((err) => {
    console.error("erro ao processar mensagem", incoming.messageId, err);
  });
}
```

- [ ] **Step 5: Implementar `apps/agent/src/server.ts`**

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createClient } from "@ia/db";
import { loadConfig } from "./config";
import { createHandlerDeps, handleUpsert } from "./webhook/handler";

export function createApp(deps: ReturnType<typeof createHandlerDeps>) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/webhook", async (c) => {
    const payload = await c.req.json().catch(() => null);
    handleUpsert(deps, payload);
    return c.json({ received: true });
  });
  return app;
}

function main() {
  const config = loadConfig();
  const { db } = createClient(config.databaseUrl);
  const deps = createHandlerDeps(db, config);
  const app = createApp(deps);
  serve({ fetch: app.fetch, port: config.port });
  console.log(`agent ouvindo na porta ${config.port}`);
}

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  main();
}
```

- [ ] **Step 6: Rodar o teste de integração e ver passar**

Run: `pnpm --filter @ia/agent test handler`
Expected: PASS (2 testes).

- [ ] **Step 7: Rodar toda a suíte do app e typecheck**

Run: `pnpm --filter @ia/agent test && pnpm --filter @ia/agent typecheck`
Expected: tudo passa.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/agent/process-message.ts apps/agent/src/webhook/handler.ts apps/agent/src/server.ts apps/agent/test/handler.test.ts
git commit -m "feat(agent): handler do webhook, processamento e servidor hono"
```

---

### Task 6: docker-compose (serviço agent) e env

**Files:**
- Modify: `docker-compose.yml` (adicionar serviço `agent`)
- Modify: `.env.example` (adicionar vars do Evolution)
- Modify: `README.md` (passo do agent)

**Interfaces:**
- Consumes: imagem/So do app; env.
- Produces: o `agent` sobe junto do stack e depende do Postgres.

- [ ] **Step 1: Adicionar o serviço em `docker-compose.yml`**

```yaml
  agent:
    build:
      context: .
      dockerfile: apps/agent/Dockerfile
    env_file: .env
    environment:
      DATABASE_URL: postgresql://ia:ia@postgres:5432/ia_agent
    ports:
      - "3001:3001"
    depends_on:
      - postgres
```

- [ ] **Step 2: Criar `apps/agent/Dockerfile`**

```dockerfile
FROM node:20-slim
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json packages/db/package.json
COPY apps/agent/package.json apps/agent/package.json
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "--filter", "@ia/agent", "start"]
```

- [ ] **Step 3: Adicionar as vars ao `.env.example`**

```
EVOLUTION_API_URL=https://evolution.lucasferrari.dev
EVOLUTION_INSTANCE=
EVOLUTION_API_KEY=
PORT=3001
```

- [ ] **Step 4: Atualizar `README.md`**

Adicionar à seção de setup:

```markdown
6. Configure o webhook da sua instancia Evolution para POST http://<host>:3001/webhook (evento MESSAGES_UPSERT)
7. `pnpm --filter @ia/agent dev` para rodar o agente localmente
```

- [ ] **Step 5: Verificar o build da imagem do agent**

Run: `docker compose build agent`
Expected: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml apps/agent/Dockerfile .env.example README.md
git commit -m "chore(agent): servico no docker-compose e env"
```

---

## Self-Review (feito pelo autor do plano)

**Cobertura do spec:**
- Spike Gemini (risco nº 1) → Task 0. ✔
- Webhook async + idempotência (processed_messages) → Tasks 2, 5. ✔
- Gateway Evolution com adaptador de mídia (base64/fetch) e sendText → Task 3. ✔
- Mastra Agent + 5 tools; 2 funções novas no db (update/delete) + last transaction → Tasks 2, 4. ✔
- Correção/apagar o último lançamento → Tasks 2, 4. ✔
- Primeiro contato (bootstrap + saudação), persona, fora de escopo → Tasks 4, 5. ✔
- fromMe e tipos não suportados → Task 5. ✔
- Deploy (4º serviço) + env → Task 6. ✔
- Testes sem API real (Gemini/Evolution mockados, PGlite) → Tasks 2–5. ✔

**Fora deste plano:** notificação de convite disparada pelo painel (fronteira registrada no spec; será resolvida no plano do painel reusando `evolution.ts`).

**Placeholders:** nenhum. Onde a API do Mastra pode divergir por versão, o código real está presente com instrução explícita de reconciliação mantendo as assinaturas exportadas.

**Consistência de tipos:** `IncomingMessage`, `AppConfig`, `ProcessDeps`/`RunAgentArgs`, os nomes de tools e as `*Impl` são referenciados de forma idêntica entre as tarefas.

**Nota de decisão (refinamento sobre o spec):** o "último lançamento" para corrigir/apagar é resolvido pela transação mais recente do usuário no banco (`getLastTransactionForUser`), não por estado de working memory — mais robusto. A Mastra Memory cobre apenas o contexto conversacional. Consistente com a intenção do spec.
