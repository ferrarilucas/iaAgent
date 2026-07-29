# Migração do stack Mastra + AI SDK — Documento de Design

**Data:** 2026-07-29
**Status:** Aprovado (design), pronto para plano de implementação
**Depende de:** `apps/agent` já mergeado na `main`.

## Objetivo

Migrar o `apps/agent` das versões antigas do Mastra (0.10.x) e AI SDK (`ai@4.3.19`,
`@ai-sdk/google@1.2.22`) para o stack moderno (Mastra 1.x, AI SDK v5+ transitiva,
`@ai-sdk/google@4.x`), para poder usar os modelos **Gemini 3.x** (que funcionam no
free tier da conta atual) com tool calling — hoje bloqueado pelo erro
`thought_signature` que o AI SDK v4 não suporta.

## Contexto / motivação

Descoberto em teste ao vivo:
- `gemini-2.5-flash` → 404 (aposentado para novos usuários).
- `gemini-2.0-flash` (e 2.x/lite) → 429 `limit: 0` (free tier não dá quota) ou 404.
- `gemini-flash-latest` (resolve para `gemini-3.6-flash`) → **200**, mas quebra no
  tool calling com HTTP 400 "Function call is missing a thought_signature", porque
  o `ai@4.3.19` é anterior ao Gemini 3 e não captura/reenvia a assinatura.

Ou seja: no free tier desta conta, o único modelo que responde é 3.x, e ele exige o
stack novo. Migrar destrava o uso sem depender de billing.

## Escopo

Somente **`apps/agent`**. O `packages/db` não depende de Mastra nem AI SDK (drizzle/
postgres/pglite) — fica intocado.

## Mudança de dependências (`apps/agent/package.json`)

| Pacote | De | Para |
|---|---|---|
| `@mastra/core` | ^0.10.0 | ^1.x (latest estável) |
| `@mastra/memory` | ^0.10.0 | ^1.x |
| `@mastra/pg` | ^0.10.0 | ^1.x |
| `@ai-sdk/google` | ^1.0.0 | ^4.x |

O `ai` (AI SDK) não é dependência direta do `apps/agent` — vem transitiva pelo
Mastra, então o Mastra 1.x já traz a versão compatível (v5+). A implementação
resolve o **conjunto mutuamente compatível** (Mastra dita o `ai`; o `@ai-sdk/google`
casa com ele), instalando as versões que fecham — mesma estratégia do build original.

## Adaptações de API (4 arquivos de fiação)

| Arquivo | Mudança |
|---|---|
| `agent.ts` | API do `new Agent(...)` no Mastra 1.x; modelo passa a `gemini-flash-latest` |
| `tools.ts` | Assinatura do `createTool` (execute/context) no Mastra 1.x. As funções puras `*Impl` NÃO mudam |
| `memory.ts` | Construtor de `Memory` + `PostgresStore` do `@mastra/pg` 1.x |
| `handler.ts` | `agent.generate(...)` e o shape da mensagem multimodal (AI SDK v5 usa `mediaType` no file part, não `mimeType`) |

As assinaturas exatas do Mastra 1.x devem ser lidas dos tipos do pacote instalado
durante a implementação (reconciliação de versão), mantendo os nomes exportados
(`buildAgent`, `createTools`, `buildMemory`, `createHandlerDeps`, `handleUpsert`,
os 5 ids de tools) e o comportamento.

## Impacto nos testes

Nenhum teste precisa mudar. A lógica financeira vive nas funções puras `*Impl`
(agnósticas ao Mastra), e os testes existentes são agnósticos ao Mastra:
- `tools.test.ts` — exercita `*Impl`, não a fiação do Mastra.
- `handler.test.ts` — mocka `runAgent`/`sendText`/`markAsRead`/`setTyping`.
- `evolution.test.ts` — não usa Mastra.

A correção da fiação do Mastra é verificada por **typecheck + teste ao vivo**, como
no build original.

## Pré-condições e riscos

1. **Disco.** O `pnpm install` do stack novo troca a árvore inteira do Mastra e pode
   travar o engine do OrbStack se o disco estiver cheio (foi o que o pull do Evolution
   fez). Pré-condição: **espaço livre adequado antes de instalar** (resolvido: ~3.7Gi
   livres no momento do design). O plano checa o espaço antes do install.
2. **Processos vivos.** Parar o agente (`tsx watch`) e o `ngrok` durante a migração
   (o watch reinicia e quebra em estados intermediários). Religar no fim para a
   verificação ao vivo.
3. **API do Mastra 1.x incerta.** Ler os tipos instalados e reconciliar; manter
   assinaturas exportadas e ids de tools.

## Verificação (definição de "pronto")

- 13 testes do `apps/agent` + 12 do `packages/db` passando no stack novo.
- `typecheck` limpo em `apps/agent` e `packages/db`.
- **Mensagem real ao vivo** processada com `gemini-flash-latest`, registrando a
  transação e respondendo — sem o HTTP 400 de `thought_signature`. Este é o teste que
  prova que a migração atingiu o objetivo.

## Fora de escopo

- Alterações no `packages/db` (não afetado).
- Billing do Google (a migração é justamente para evitar essa dependência).
- Novas features do agente (a migração preserva comportamento).
