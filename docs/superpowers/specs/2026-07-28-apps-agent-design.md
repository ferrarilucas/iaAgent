# apps/agent — Documento de Design

**Data:** 2026-07-28
**Status:** Aprovado (design), pronto para plano de implementação
**Depende de:** `packages/db` (fundação já mergeada) e da spec macro
[2026-07-28-agente-financeiro-whatsapp-design.md](2026-07-28-agente-financeiro-whatsapp-design.md)

## Objetivo

O `apps/agent` é o cérebro do sistema: recebe mensagens do WhatsApp via Evolution
API, usa o Gemini (multimodal) para entender texto/áudio/foto/vídeo/PDF, decide
entre **registrar** e **consultar** dados financeiros, e responde no chat. Captura
e consulta em um só serviço, com correção de lançamentos por mensagem seguinte.

## Escopo do primeiro build

- Receber `MESSAGES_UPSERT` do Evolution (v2.3.7), processar mídia e responder.
- Registrar lançamentos (incluindo lote de fatura) e responder consultas/resumos.
- Corrigir e apagar o **último** lançamento por mensagem seguinte.
- Primeiro contato: bootstrap automático do usuário + saudação.

Fora de escopo (evoluções futuras):
- Corrigir/apagar transações arbitrárias por linguagem natural (fica no painel).
- Relatórios proativos / alertas (cron reusando as tools).
- Notificação de convite disparada pelo painel — pertence ao plano do painel; ver
  "Notas de fronteira".

## Decisões de arquitetura

| Item | Escolha | Motivo |
|---|---|---|
| Gateway WhatsApp | Evolution API v2.3.7 (`evolution.lucasferrari.dev`) | Já rodando; abstrai Baileys |
| Entrega de mídia | Adaptador: base64 do payload se presente, senão `POST /chat/getBase64FromMediaMessage/{instance}` | v2 não manda base64 por padrão; robusto às duas configs |
| Envio de resposta | `POST /message/sendText/{instance}` | Endpoint padrão v2 |
| LLM | Gemini 2.5 Flash via Mastra | Multimodal nativo (dispensa Whisper/OCR) |
| Framework de agente | Mastra Agent + tools Zod | Function calling gerenciado, memória, model routing |
| Servidor HTTP | Server embutido do Mastra (Hono) + rota `POST /webhook` | Um framework só |
| Confirmação | Salvar e confirmar; perguntar só quando ambíguo | Fluidez no uso diário; correção por follow-up |
| Correção/exclusão | Apenas o último lançamento (via memória) | Cobre o fluxo natural sem desambiguação arbitrária |

### Isolamento

`evolution.ts` é o único módulo que fala com o Evolution; `tools.ts` é o único que
fala com o banco. Trocar Evolution por Cloud API = mexer só em `evolution.ts`.
Trocar o LLM = uma linha no model routing do Mastra.

## Estrutura de módulos

```
apps/agent/
  src/
    server.ts            Mastra server + registro da rota POST /webhook
    webhook/
      handler.ts         valida evento, dedupe (idempotência), 200 imediato, processa async
      evolution.ts       whatsapp-gateway: parse MESSAGES_UPSERT, baixar mídia, enviar texto
    agent/
      agent.ts           Mastra Agent (Gemini 2.5 Flash) + instruções/persona
      tools.ts           tools Zod -> packages/db
      memory.ts          Mastra Memory (thread por número; guarda "última transação")
    config.ts            env validado
  test/                  tools e gateway mockados; integração webhook->registro->resposta
```

## Fluxo do webhook (assíncrono + idempotente)

1. Evolution → `POST /webhook` com `MESSAGES_UPSERT`.
2. Handler **responde 200 imediatamente** e processa em background (não segura a
   conexão; evita timeout e reenvio).
3. **Idempotência:** dedupe pelo `key.id` da mensagem via tabela `processed_messages`
   no Postgres; reenvios são ignorados.
4. Ignora mensagens próprias (`key.fromMe = true`) e tipos não suportados (sticker,
   localização) com resposta educada.

## O agente e as tools

Um Mastra Agent (Gemini 2.5 Flash) recebe a mensagem (mídia anexada) + memória do
usuário e escolhe a tool:

| Tool | Ação | Função em `packages/db` |
|---|---|---|
| `registrar_transacao` | cria 1..N lançamentos (lote de fatura) | `insertTransactions` (existe) |
| `consultar_transacoes` | lista com filtros | `listTransactionsForSpace` (existe) |
| `resumo` | somatório por categoria/período | `sumByCategory` (existe) |
| `corrigir_ultima_transacao` | altera o último lançamento | **novo:** `updateTransaction` |
| `apagar_ultima_transacao` | apaga o último lançamento | **novo:** `deleteTransaction` |

As duas últimas exigem **duas funções novas em `packages/db`** (`updateTransaction`,
`deleteTransaction`, por id), implementadas com testes antes de serem usadas no agente.

O agente resolve a categoria pelo nome (via `findCategoryByName`); se não existir a
categoria informada, usa "outros" do tipo correspondente.

## Memória e fluxo de correção

- **Mastra Memory**, thread por número de WhatsApp, com histórico curto e a
  referência da **última transação** do usuário (working memory).
- *"não, era transporte"* logo após um registro → o agente sabe qual `transaction.id`
  corrigir e chama `corrigir_ultima_transacao`.

## Pipeline de mídia

`evolution.ts` obtém o base64 (payload ou `getBase64FromMediaMessage`) e o entrega
ao Gemini, que transcreve/lê nativamente. `source` da transação é derivado do tipo
da mensagem (texto/áudio/foto/vídeo/pdf).

## Primeiro contato, persona e fora de escopo

- **Primeiro contato** (número desconhecido): bootstrap automático (`bootstrapUser`
  + `seedCategories`) e saudação explicando o que faz, com um exemplo.
- **Persona:** assistente financeiro direto e amigável, PT-BR, respostas curtas.
- **Fora de escopo** (pergunta não financeira): declina educadamente e reconduz.

## Tratamento de erros

- **Extração ambígua** → o agente pergunta em vez de chutar.
- **Gemini/Evolution indisponível** → resposta "não consegui processar agora, tente
  de novo"; erro logado; a mensagem já está deduplicada, então um reenvio manual do
  usuário é reprocessável.
- **Tipo de mídia não suportado** → resposta educada, sem quebrar.

## Deploy

Novo (4º) serviço no `docker-compose`: `agent` (server Mastra), junto de Evolution,
Postgres e (futuro) web. Config por env (`EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`,
`EVOLUTION_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DATABASE_URL`).

## Testes

- Tools testadas contra Postgres de teste (PGlite), Gemini mockado.
- Gateway (`evolution.ts`) com HTTP do Evolution mockado.
- Teste de integração do fluxo webhook → registro → resposta, com Gemini e Evolution
  mockados. Sem gastar API real.

## Riscos e validações antecipadas

1. **Multimodal áudio/vídeo do Gemini via Mastra/AI SDK** — permanece o risco nº 1
   e vira a **primeira tarefa (spike)** do plano, validada com a chave real e um
   áudio gravado antes de construir o resto. Plano B: Gemini SDK direto só nesse
   trecho.
2. **Contrato do webhook do Evolution v2.3.7** — capturar um `MESSAGES_UPSERT` real
   cedo para confirmar o shape do payload e o caminho da mídia (base64 vs fetch).
3. **Maturidade do Mastra** — fixar versão e isolar no `apps/agent`.

## Notas de fronteira (fora deste plano)

- **Notificação de convite:** o painel cria o convite e precisa avisar o convidado
  no WhatsApp. Todo envio ao WhatsApp passa pelo agente (gateway único), então o
  painel delegará ao agente (endpoint interno ou outbox compartilhado) — o mecanismo
  concreto é decidido no plano do painel. O agente reusa `evolution.ts` para isso.
