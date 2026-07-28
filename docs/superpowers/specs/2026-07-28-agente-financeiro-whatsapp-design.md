# Agente Financeiro no WhatsApp — Documento de Design

**Data:** 2026-07-28
**Status:** Aprovado (design), pronto para plano de implementação

## Objetivo

Um agente de IA no WhatsApp que **captura e armazena** o controle financeiro
pessoal através de texto, áudio, foto, vídeo e documentos (PDF), e **responde
consultas** sobre esses dados pelo próprio chat. Feito primeiro para uso pessoal,
mas com fundações limpas para virar produto multiusuário.

## Escopo do primeiro build

- Capturar lançamentos (despesas/receitas) a partir de qualquer mídia.
- Responder perguntas no chat ("quanto gastei em mercado esse mês?").
- Vínculo entre usuários: espaços financeiros compartilhados (ex.: casal
  gerenciando as contas de casa), com convite/aceite gerenciados por um painel web.
- Painel web para visualização (gráficos, transações) e gestão de espaços.

Fora de escopo agora (evoluções futuras):
- Relatórios proativos / alertas automáticos (cron chamando as mesmas tools).
- Inferência automática de espaço por frase ("isso é gasto de casa").
- Guardar arquivos originais (comprovantes) — hoje só os dados extraídos.

## Decisões de arquitetura

| Camada | Escolha | Motivo |
|---|---|---|
| Gateway WhatsApp | **Evolution API** (já em uso) | Abstrai Baileys; permite migrar para Cloud API oficial sem reescrever o agente |
| Cérebro / LLM | **Gemini 2.5 Flash** (multimodal) | Lê texto/áudio/foto/vídeo/PDF nativamente; dispensa Whisper e OCR dedicado |
| Framework de agente | **Mastra** (TypeScript) | Tools tipadas (Zod), memória conversacional, model routing (isola o LLM), tracing/evals, playground |
| Servidor HTTP | Server embutido do Mastra (Hono) | Hospeda a rota do webhook; elimina um framework HTTP separado |
| Banco de dados | **PostgreSQL** self-hosted (Docker) | Dados financeiros são tabulares; SQL brilha em somar/agrupar/filtrar |
| ORM | **Drizzle** | TS-first, leve, sem geração de código pesada |
| Painel web | **Next.js** + **Recharts** | Dashboard React com backend-for-frontend embutido |
| Auth do painel | **OTP via WhatsApp** (Better Auth) | Identidade já é o número; reaproveita o Evolution para entregar o código |
| Monorepo | **pnpm workspaces + Turborepo** | Compartilha schema/banco entre agente e painel sem duplicação |

### Ponto-chave de isolamento

O módulo de agente não sabe SQL; o repositório não sabe nada de WhatsApp/Gemini.
Trocar o Evolution pela Cloud API oficial amanhã mexe **só** no `whatsapp-gateway`.
Trocar o Gemini por outro LLM é uma linha no model routing do Mastra.

## Estrutura do monorepo

```
apps/
  agent/     Servidor Mastra: webhook do Evolution + agente Gemini + tools
  web/       Next.js: painel, auth (OTP WhatsApp), espaços/convites, gráficos

packages/
  db/        Drizzle: schema + migrations + repository (FONTE ÚNICA DA VERDADE)
  core/      Tipos/domínio compartilhados (Transaction, Space, Money, ...)
```

`apps/agent` e `apps/web` importam `packages/db`. Uma transação lançada pelo
WhatsApp aparece no painel instantaneamente — mesmo banco, mesmo schema, zero
sincronização.

## Componentes (unidades isoladas)

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `whatsapp-gateway` (agent) | Falar com o Evolution: receber webhook, baixar mídia, enviar resposta e notificações | Evolution API |
| `agent` (Mastra Agent) | Orquestrar o Gemini: prompt, expor tools, memória conversacional | Gemini via Mastra |
| `tools` | Ações do agente: `registrar_transacao`, `consultar_transacoes`, `resumo`, `trocar_espaco` | `packages/db` |
| `db` (package) | Schema Drizzle, migrations e repository | Postgres |
| `web` API routes | Endpoints do painel (transações, espaços, convites) + auth | `packages/db` |
| `web` UI | Telas: visão geral, transações, espaços/convites | `web` API |

## Modelo de dados (Postgres)

```
users
  id, whatsapp_number (unique), name, active_space_id (FK -> spaces), created_at
  active_space_id: em qual espaço os lançamentos dessa pessoa caem agora

spaces
  id, name, created_at
  o "cofre" compartilhado (conta pessoal OU de casa)

space_members
  space_id, user_id, role (owner|member), joined_at
  PK (space_id, user_id). Um casal = duas linhas apontando para o mesmo space

invitations
  id, space_id, invited_by (user_id), invited_number, status (pending|accepted|declined), created_at

categories
  id, space_id, name, type (despesa|receita)
  seed inicial: alimentacao, transporte, moradia, lazer, saude, salario, ...

transactions
  id, space_id, created_by (user_id), type (despesa|receita), amount (numeric),
  category_id, description, occurred_at, source (texto|audio|foto|video|pdf), created_at
  space_id = de quem é o dinheiro; created_by = quem lançou

messages  (opcional — Mastra Memory pode cobrir; avaliar na implementação)
  histórico curto para contexto conversacional
```

Regras:
- `amount` é `numeric` (nunca float — dinheiro não admite erro de arredondamento).
- Transações pertencem a `spaces`, não a `users`. `space_id` responde "quanto a
  casa gastou"; `created_by` responde "quanto eu lancei vs. quanto ela lançou".
- Memória conversacional preferencialmente via **Mastra Memory** no Postgres; a
  tabela `messages` manual é fallback caso a Memory não atenda.

## Fluxo de uma mensagem (captura + consulta)

1. Usuário envia texto/áudio/foto/vídeo/PDF → Evolution dispara webhook.
2. `whatsapp-gateway` identifica o usuário pelo número e baixa a mídia (se houver).
3. `agent` chama o Gemini com a mensagem + mídia + tools + memória do usuário.
4. Gemini decide:
   - registro → chama `registrar_transacao` (aceita **lote**, ex.: fatura com 40 itens);
   - pergunta → chama `consultar_transacoes` / `resumo`;
   - troca de contexto → chama `trocar_espaco`.
5. A tool roda no Postgres (via `packages/db`) e devolve o dado.
6. Gemini formata a resposta natural; `whatsapp-gateway` responde pelo Evolution.

### Roteamento de espaço

O lançamento cai sempre no `active_space` do usuário. Ele troca por comando
natural ("muda para a conta de casa"), atendido pela tool `trocar_espaco`.
Inferência automática por frase fica como refinamento futuro para evitar
ambiguidade agora.

## Vínculo entre usuários (convite/aceite — no painel)

1. No painel, no espaço "Casa", o dono clica **Convidar** e informa o número →
   cria `invitation` pendente.
2. O agente dispara uma notificação no WhatsApp do convidado: "Você foi convidado
   para 'Casa'. Abra o painel para aceitar: [link]".
3. O convidado abre o painel, loga com o número dele (OTP), vê o convite e
   **Aceita** → entra como `member` (nova linha em `space_members`).

Aceite é sempre **explícito** (privacidade/segurança). A gestão do vínculo é toda
no painel; o agente só notifica.

## Auth do painel (OTP via WhatsApp)

- Usuário digita o número no painel → sistema envia código de 6 dígitos pelo
  WhatsApp (via Evolution) → usuário entra. Sem senha, sem email.
- Lib: **Better Auth** (TS-first, Postgres, suporta OTP). Reaproveita a infra de
  WhatsApp para entregar o código — nenhuma peça nova de entrega.

## Primeiro contato (bootstrap do usuário)

Na primeira mensagem de um número desconhecido, o sistema cria automaticamente:
- uma linha em `users` (com o número);
- um `space` pessoal ("Pessoal do <nome>");
- a linha `space_members` como `owner`;
- define `active_space_id` para esse espaço.

## Tratamento de erros e casos-limite

- **Extração ambígua** ("gastei uma grana") → o agente pergunta em vez de chutar.
- **Fatura com múltiplas transações** → `registrar_transacao` aceita lote; o
  agente extrai todas e confirma o total.
- **Webhook duplicado** (Evolution reenvia) → idempotência por ID da mensagem.
- **Gemini indisponível/erro** → resposta "não consegui processar agora, tente de
  novo"; erro logado; a mensagem não é perdida.
- **Áudio/vídeo pelo Gemini via Mastra** → é o **primeiro risco técnico a
  validar** (ver Riscos). Se falhar, isolar esse trecho no Gemini SDK direto.

## Deploy

`docker-compose` com 4 serviços, tudo no VPS:
- **Evolution** (WhatsApp gateway — já existente)
- **Postgres**
- **agent** (servidor Mastra)
- **web** (Next.js)

## Testes

- Unitários em `tools` e no repositório (`packages/db`), contra um Postgres de teste.
- Gemini **mockado** na lógica do agente para não gastar API em teste.
- Teste de integração cobrindo o fluxo webhook → registro → consulta.

## Riscos e validações antecipadas

1. **Multimodal áudio/vídeo via Mastra/AI SDK + Gemini.** Imagem e PDF são
   tranquilos; áudio/vídeo pelo provider do Google *deve* funcionar, mas é o
   primeiro item a validar com um teste real. Plano B: Gemini SDK direto só nesse
   trecho, sem afetar o resto.
2. **Maturidade do Mastra.** Framework novo, evoluindo rápido; possível quebra
   entre versões. Mitigação: fixar versão e isolar a dependência no `apps/agent`.
3. **Auth self-hosted (Better Auth + OTP).** Sem Supabase, auth e (futuro) storage
   de arquivos são responsabilidade nossa. Aceitável; escopo controlado.

## Evoluções futuras (fora do escopo atual)

- Relatórios proativos / alertas de orçamento (cron reusando as tools).
- Inferência automática de espaço por linguagem natural.
- Storage de arquivos originais (MinIO/S3) para auditoria de comprovantes.
- Migração do Evolution para a WhatsApp Cloud API oficial ao virar produto.
