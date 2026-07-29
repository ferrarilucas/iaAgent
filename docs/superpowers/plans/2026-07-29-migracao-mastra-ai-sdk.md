# Migração do stack Mastra + AI SDK — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o `apps/agent` para Mastra 1.x + AI SDK v5+ (`@ai-sdk/google` 4.x), trocar o modelo para `gemini-flash-latest`, e provar (testes verdes + mensagem ao vivo) que o tool calling funciona sem o erro `thought_signature`.

**Architecture:** Migração isolada ao `apps/agent` (o `packages/db` não usa Mastra). A lógica financeira vive em funções puras `*Impl` agnósticas ao Mastra, então só os 4 arquivos de fiação mudam e nenhum teste precisa ser reescrito — os 13 testes do agente e 12 do db são a rede de segurança. A API exata do Mastra 1.x é lida dos tipos instalados e reconciliada, preservando nomes exportados e comportamento.

**Tech Stack:** Node 20+, pnpm, TypeScript strict, Mastra 1.x (`@mastra/core`, `@mastra/memory`, `@mastra/pg`), AI SDK v5+ (`ai` transitiva), `@ai-sdk/google` 4.x, Gemini `gemini-flash-latest`, Hono, `@ia/db` (workspace), Vitest, PGlite.

## Global Constraints

- **NUNCA adicionar comentários no código** — nenhum arquivo `.ts`/config.
- **TypeScript strict** em `apps/agent`.
- **Preservar os nomes exportados e ids de tools:** `buildAgent(memory, tools)`, `createTools(db, userId, spaceId)` (ids `registrar_transacao`, `consultar_transacoes`, `resumo`, `corrigir_ultima_transacao`, `apagar_ultima_transacao`), `buildMemory(config)`, `createHandlerDeps(db, config)`, `handleUpsert(deps, payload)`, `createApp(deps)`. As funções puras `*Impl` em `tools.ts` NÃO mudam.
- **Nenhum teste é reescrito.** Se um teste quebrar, o defeito está na fiação, não no teste — conserte a fiação. (Exceção única permitida: se o AI SDK v5 exigir mudar o *nome do campo* do file part de `mimeType` para `mediaType`, isso é código de produção em `handler.ts`, não teste.)
- **Dinheiro é string;** nunca coagir `amount` para número.
- **Modelo alvo:** `gemini-flash-latest`.
- **Reconciliação de versão:** ler os tipos do pacote instalado (`node_modules/@mastra/core/dist/**/*.d.ts` etc.) e adaptar as chamadas à API real da versão instalada, mantendo as assinaturas exportadas acima. Registrar cada ajuste no report.
- **Verificação sem gastar API real nos testes unitários** (Gemini/Evolution mockados; PGlite). A chamada real ao Gemini só na Task 3 (verificação ao vivo).

---

## Estrutura de arquivos (o que este plano altera)

```
apps/agent/
  package.json                     versões novas (Mastra 1.x, @ai-sdk/google 4.x)
  src/
    agent/agent.ts                 API do Agent 1.x + modelo gemini-flash-latest
    agent/tools.ts                 API do createTool 1.x (as *Impl NAO mudam)
    agent/memory.ts                Memory + PostgresStore 1.x
    webhook/handler.ts             agent.generate 1.x + file part (mediaType)
  test/                            NAO muda (rede de seguranca)
```

`packages/db` não é tocado.

---

### Task 1: Preparação e upgrade de dependências

**Files:**
- Modify: `apps/agent/package.json`

**Interfaces:**
- Consumes: nada.
- Produces: o stack novo instalado no workspace; as versões exatas instaladas registradas para a Task 2 usar na reconciliação.

- [ ] **Step 1: Parar os processos vivos que atrapalham a migração**

Run:
```bash
pkill -f "tsx watch src/server.ts" 2>/dev/null; pkill -f "@ia/agent dev" 2>/dev/null; pkill -f "ngrok http 3001" 2>/dev/null; true
```
Expected: sem erro (mata o agente em watch e o ngrok se estiverem rodando).

- [ ] **Step 2: Confirmar espaço em disco antes do install**

Run: `df -h /System/Volumes/Data | tail -1`
Expected: pelo menos ~2Gi livres na coluna Avail. Se estiver abaixo disso, PARE e reporte BLOCKED (o install pode travar o engine do OrbStack); não instale sem folga.

- [ ] **Step 3: Atualizar as versões em `apps/agent/package.json`**

Trocar as quatro dependências para as majors novas (deixe o pnpm resolver o patch exato):

```json
    "@ai-sdk/google": "^4.0.0",
    "@mastra/core": "^1.0.0",
    "@mastra/memory": "^1.0.0",
    "@mastra/pg": "^1.0.0",
```

Mantenha as demais deps (`@hono/node-server`, `@ia/db`, `hono`, `zod`) e os `devDependencies` como estão.

- [ ] **Step 4: Instalar e resolver o conjunto compatível**

Run: `pnpm install`
Expected: instala. Se houver conflito de peer entre `@mastra/*` e `@ai-sdk/google`/`ai`, instale o conjunto que fecha: primeiro `pnpm --filter @ia/agent add @mastra/core@latest @mastra/memory@latest @mastra/pg@latest`, depois alinhe `@ai-sdk/google` à versão que o `ai` (transitivo do Mastra) exige (leia o peer do `@ai-sdk/google` ou a doc da versão). Não force resoluções que quebrem peers.

- [ ] **Step 5: Registrar as versões instaladas**

Run: `pnpm --filter @ia/agent ls @mastra/core @mastra/memory @mastra/pg @ai-sdk/google ai 2>/dev/null; node -e "for (const p of ['@mastra/core','@mastra/memory','@mastra/pg','@ai-sdk/google','ai']) { try { console.log(p, require(p+'/package.json').version) } catch(e){ console.log(p,'?') } }"`
Expected: imprime as versões. **Anote-as no report** — a Task 2 precisa delas para reconciliar a API. Nota: o `typecheck` VAI falhar agora (os 4 arquivos ainda usam a API 0.10); isso é esperado e corrigido na Task 2.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/package.json pnpm-lock.yaml
git commit -m "chore(agent): sobe mastra 1.x + ai-sdk/google 4.x"
```

---

### Task 2: Adaptar a fiação do Mastra ao stack novo

Ajustar os 4 arquivos de fiação para compilar contra a API do Mastra 1.x / AI SDK v5, preservando os nomes exportados e o comportamento. Verificação: `typecheck` limpo + os 13 testes do agente + 12 do db verdes (nenhum teste é reescrito).

**Files:**
- Modify: `apps/agent/src/agent/agent.ts`
- Modify: `apps/agent/src/agent/tools.ts`
- Modify: `apps/agent/src/agent/memory.ts`
- Modify: `apps/agent/src/webhook/handler.ts`

**Interfaces:**
- Consumes: versões instaladas da Task 1; `@ia/db` (repository, inalterado); as funções puras `*Impl` de `tools.ts` (inalteradas).
- Produces: os mesmos exports de antes, agora sobre Mastra 1.x — `buildAgent`, `createTools`, `buildMemory`, `createHandlerDeps`, `handleUpsert`, `createApp`, e os 5 ids de tools.

**Como reconciliar (leia antes de editar):** para cada arquivo abaixo está o **código atual (0.10)**. Leia os tipos instalados (ex.: `ls node_modules/@mastra/core/dist` e abra os `.d.ts` de `agent`/`tools`; `node_modules/@mastra/memory`, `node_modules/@mastra/pg`) e ajuste as chamadas à API real da versão 1.x, mantendo a assinatura exportada e o comportamento. Onde a mudança é conhecida, está indicada.

- [ ] **Step 1: Adaptar `agent.ts`**

Código atual:
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
Mudanças obrigatórias: (a) modelo passa a `google("gemini-flash-latest")`; (b) ajustar imports/construtor do `Agent` à API 1.x se divergirem (o import pode ter mudado de `@mastra/core/agent`; o objeto de config pode ter outros nomes). Preservar `buildAgent(memory, tools): Agent` e a PERSONA (texto idêntico).

- [ ] **Step 2: Adaptar `tools.ts` (apenas os wrappers `createTool`, NÃO os `*Impl`)**

As funções puras (`registrarTransacaoImpl`, `consultarImpl`, `resumoImpl`, `corrigirUltimaImpl`, `apagarUltimaImpl`, `resolveCategoria`) e o `itemSchema` **ficam idênticos**. Só o `createTools` muda, se a assinatura do `createTool` do Mastra 1.x divergir. Forma atual:
```ts
import { createTool } from "@mastra/core/tools";
...
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
      inputSchema: z.object({ from: z.string().optional(), to: z.string().optional(), type: z.enum(["despesa", "receita"]).optional() }),
      execute: async ({ context }) => consultarImpl(db, { spaceId, ...context }),
    }),
    resumo: createTool({
      id: "resumo",
      description: "Soma por categoria em um periodo, por tipo.",
      inputSchema: z.object({ from: z.string(), to: z.string(), type: z.enum(["despesa", "receita"]) }),
      execute: async ({ context }) => resumoImpl(db, { spaceId, ...context }),
    }),
    corrigir_ultima_transacao: createTool({
      id: "corrigir_ultima_transacao",
      description: "Corrige o ultimo lancamento do usuario (categoria, valor, tipo, data ou descricao).",
      inputSchema: z.object({ type: z.enum(["despesa", "receita"]).optional(), amount: z.string().optional(), categoria: z.string().optional(), description: z.string().optional(), occurredAt: z.string().optional() }),
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
Reconciliação típica no Mastra 1.x: o `createTool` pode exigir `inputSchema` + `outputSchema`, e o `execute` pode receber os argumentos parseados de outra forma (ex.: `execute: async ({ context })` vs `execute: async (input)` vs `execute: async ({ input })`). Ajuste apenas a forma de extrair os argumentos; a chamada às `*Impl` e os ids/descrições permanecem.

- [ ] **Step 3: Adaptar `memory.ts`**

Forma atual:
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
Reconciliação: no `@mastra/pg` 1.x o `PostgresStore` pode receber `{ connectionString }` ou um objeto diferente; o `Memory` pode ter mudado o formato de `options`/`storage`. O type cast que existia no 0.10 (por drift entre `@mastra/pg` e `@mastra/core`) provavelmente deixa de ser necessário no par 1.x alinhado — remova-o se o typecheck passar sem ele. Preservar `buildMemory(config): Memory` e `lastMessages: 10`.

- [ ] **Step 4: Adaptar `handler.ts` (agent.generate + file part)**

Forma atual do trecho de fiação:
```ts
const content: any[] = [{ type: "text", text: args.incoming.text ?? "" }];
if (args.incoming.kind !== "texto") {
  const base64 = await fetchMediaBase64(config, args.incoming.messageId);
  content.push({ type: "file", mimeType: MEDIA_MIME[args.incoming.kind], data: base64 });
}
const res = await agent.generate([{ role: "user", content }], {
  threadId: args.threadId,
  resourceId: args.threadId,
});
return res.text;
```
Mudanças: (a) **AI SDK v5 usa `mediaType` no file part, não `mimeType`** — troque a chave; (b) ajustar `agent.generate(...)` à API 1.x (o formato de mensagens, as opções `threadId`/`resourceId`, e como ler o texto de retorno — pode ser `res.text` ou outro campo). Preservar o comportamento: montar a mensagem multimodal (texto + mídia opcional) e devolver a string de resposta. O resto de `createHandlerDeps`/`handleUpsert` (idempotência, markAsRead, setTyping, sendText, processMessage) NÃO muda.

- [ ] **Step 5: Rodar o typecheck do agente**

Run: `pnpm --filter @ia/agent typecheck`
Expected: PASS (sem erros). Se falhar, o erro aponta o arquivo/assinatura a reconciliar — ajuste e repita.

- [ ] **Step 6: Rodar os testes do agente (a rede de segurança)**

Run: `pnpm --filter @ia/agent test`
Expected: **13 passed**. Nenhum teste foi alterado; se algum quebrar, conserte a fiação, não o teste.

- [ ] **Step 7: Rodar os testes do db (garantir que nada colateral quebrou)**

Run: `pnpm --filter @ia/db test`
Expected: **12 passed**.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/agent/agent.ts apps/agent/src/agent/tools.ts apps/agent/src/agent/memory.ts apps/agent/src/webhook/handler.ts
git commit -m "refactor(agent): migra fiacao para mastra 1.x + ai sdk v5 e usa gemini-flash-latest"
```

---

### Task 3: Verificação ao vivo (prova do objetivo)

Provar que o `gemini-flash-latest` faz o tool calling sem o HTTP 400 de `thought_signature`, ponta a ponta. Requer o stack local rodando (Postgres, agente, ngrok, webhook do Evolution).

**Files:**
- Nenhum (verificação). Ajustes de código só se a verificação revelar um defeito, e aí voltam pela Task 2.

**Interfaces:**
- Consumes: o `.env` já configurado (Evolution remoto, instância "Whats business", Postgres local 5433, chave Gemini); o build migrado da Task 2.
- Produces: evidência no log de que uma mensagem real foi processada e registrada.

- [ ] **Step 1: Garantir o Postgres local de pé**

Run: `docker start iaagent_pg 2>/dev/null; sleep 3; docker exec iaagent_pg pg_isready -U ia`
Expected: `accepting connections`. (Se o container não existir mais, recrie: `docker run -d --name iaagent_pg -e POSTGRES_USER=ia -e POSTGRES_PASSWORD=ia -e POSTGRES_DB=ia_agent -p 5433:5432 postgres:16` e rode `DATABASE_URL=postgresql://ia:ia@localhost:5433/ia_agent pnpm --filter @ia/db db:migrate`.)

- [ ] **Step 2: Subir o agente com o `.env` carregado**

Run:
```bash
cd /Users/ferrari/code/iaAgent && set -a; . ./.env; set +a && nohup pnpm --filter @ia/agent dev > /tmp/agent.log 2>&1 & sleep 10; tail -5 /tmp/agent.log; curl -s --max-time 6 http://localhost:3001/health; echo
```
Expected: `agent ouvindo na porta 3001` e `{"ok":true}`, sem erro de boot.

- [ ] **Step 3: Subir o ngrok e reapontar o webhook**

Run:
```bash
pkill -f "ngrok http 3001" 2>/dev/null; nohup ngrok http 3001 --log=stdout > /tmp/ngrok.log 2>&1 & sleep 6
NGROK=$(curl -s http://localhost:4040/api/tunnels | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s).tunnels.find(x=>x.public_url.startsWith('https'));console.log(t.public_url)})")
echo "NGROK=$NGROK"
set -a; . /Users/ferrari/code/iaAgent/.env; set +a
curl -s -X POST "$EVOLUTION_API_URL/webhook/set/Whats%20business" -H "apikey: $EVOLUTION_API_KEY" -H "content-type: application/json" -d "{\"webhook\":{\"enabled\":true,\"url\":\"$NGROK/webhook\",\"byEvents\":false,\"base64\":false,\"headers\":{\"ngrok-skip-browser-warning\":\"true\"},\"events\":[\"MESSAGES_UPSERT\"]}}" -w " [HTTP %{http_code}]\n"
```
Expected: webhook setado (HTTP 201) apontando para a URL nova do ngrok.

- [ ] **Step 4: Disparar uma mensagem real e observar**

Peça ao usuário para enviar UMA mensagem nova de outro número para a "Whats business" (ex.: "gastei 80 no mercado ontem"). Então:

Run: `sleep 8; grep -E "statusCode|thought_signature|400|429" /tmp/agent.log | tail -5; echo "---"; docker exec iaagent_pg psql -U ia -d ia_agent -tAc "select type, amount, source from transactions order by created_at desc limit 3;"`
Expected: **nenhum** `400`/`thought_signature`/`429` novo no log; a transação recém-registrada aparece na tabela `transactions`; o usuário recebeu a confirmação no WhatsApp.

- [ ] **Step 5: Registrar o resultado**

Se PASSOU: a migração atingiu o objetivo — `gemini-flash-latest` com tool calling funciona. Registre no report (com a linha da transação e a ausência de erro). Se aparecer erro novo (ex.: outro formato que o Mastra 1.x espera), volte à Task 2, ajuste a fiação, e repita esta verificação.

Nota: esta task não tem commit próprio (é verificação); qualquer correção de código volta pela Task 2 e é commitada lá.

---

## Self-Review (feito pelo autor do plano)

**Cobertura do spec:**
- Escopo isolado no `apps/agent`; `packages/db` intocado → Tasks 1-3. ✔
- Upgrade de `@mastra/core`, `@mastra/memory`, `@mastra/pg` (1.x) e `@ai-sdk/google` (4.x); `ai` transitivo → Task 1. ✔
- Adaptar `agent.ts`, `tools.ts`, `memory.ts`, `handler.ts`; `*Impl` inalteradas; `mimeType`→`mediaType` → Task 2. ✔
- Modelo `gemini-flash-latest` → Task 2, Step 1. ✔
- Nenhum teste reescrito; verificação por typecheck + testes → Task 2, Steps 5-7. ✔
- Pré-condições: parar processos, checar disco → Task 1, Steps 1-2. ✔
- Verificação ao vivo sem thought_signature 400 → Task 3. ✔

**Placeholders:** o plano mostra o código atual e as mudanças conhecidas; onde a API 1.x é incerta, instrui reconciliação contra os tipos instalados — isso é inerente a uma migração cujo alvo não é memorizável, não um placeholder de escopo. Os critérios de verificação são concretos (typecheck, 13/12 testes, ausência de 400).

**Consistência de tipos:** os nomes exportados (`buildAgent`, `createTools`, `buildMemory`, `createHandlerDeps`, `handleUpsert`, `createApp`) e os 5 ids de tools são idênticos entre as tasks e o estado atual do código.
