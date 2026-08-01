# Migração do Pilinha para SaaS multi-tenant (casca + planos)

**Data:** 2026-08-01
**Status:** Design aprovado — implementação da Fase 1 a seguir

## Contexto e objetivo

Hoje o Pilinha é efetivamente single-tenant: um número de WhatsApp, uma instância
Evolution, uma chave Gemini no env, um Postgres. O objetivo é transformá-lo num SaaS
onde cada usuário assina um plano mensal e usa a aplicação com identidade e cobrança
próprias.

Decisão de canal: **número único** (todos os clientes falam com o mesmo número do
Pilinha; o tenant é identificado pelo número de quem manda). Isso encaixa no que já
existe — o webhook já identifica o usuário por `numberFromJid` + `normalizeBrazilNumber`
e cria user/espaço no primeiro contato. O multi-tenancy aqui é **billing + config por
usuário**, não provisionamento de canal.

Trade-off assumido: todo o risco fica concentrado num número só (se ele tomar ban, todos
caem). Em escala isso empurra para a WhatsApp Cloud API oficial. Não é problema de v1, mas
é o teto de escala do modelo — fica registrado como limite conhecido.

## Planos e preços

| | BYO (chave do cliente) | Nossa IA |
|---|---|---|
| **Individual** | R$ 9,99 | R$ 29,99 |
| **Espaço** (casal/família) | R$ 14,99 | R$ 34,99 |

- **Trial:** 7 dias, sempre com a nossa IA (melhor primeira impressão).
- **Tolerância de atraso (dunning):** 3 dias após falha de pagamento antes do bloqueio.
- **Híbrido:** a unidade-base é a pessoa/número (individual). Compartilhar espaço com
  outros é um upgrade para `tier = espaco` (+R$5 nos dois modos).

O público-alvo é majoritariamente não-técnico, então o plano com a nossa IA é o
carro-chefe (margem alta: Gemini Flash custa centavos por usuário/mês). O BYO atende um
nicho técnico e por isso entra depois (Fase 3), não na fundação.

## Entrada e identidade

Duas portas, uma conta só, ancorada no número normalizado:

- **WhatsApp-first:** manda "oi", conta criada pelo número, trial começa, agente já
  responde.
- **Web-first:** cadastra no site, escolhe plano, começa trial, número fica ligado.

Convergem porque em ambos a identidade é o `normalizeBrazilNumber`. Pré-requisito crítico
(**Fase 0, já concluída** em 2026-08-01): normalizar os números existentes em prod para
evitar conta duplicada.

## 1. Modelo de dados (`packages/db`)

Tabelas novas (Drizzle + migration):

- **`subscriptions`** — `id`, `user_id` (dono), `tier` (`individual` | `espaco`),
  `ai_mode` (`nossa` | `byo`), `status` (`trial` | `ativo` | `atrasado` | `cancelado`),
  `trial_ends_at`, `current_period_end`, `past_due_since` (para calcular os 3 dias de
  tolerância), `provider`, `provider_customer_id`, `provider_subscription_id`,
  `created_at`, `updated_at`. Os dois eixos (`tier` × `ai_mode`) ficam separados de
  propósito — geram a matriz de 4 combos sem enum rígido.
- **`ai_credentials`** (só BYO) — `user_id`, `provider`, `encrypted_key`, `model`,
  `status` (`valida` | `invalida` | `sem_quota` | `nao_checada`), `last_checked_at`.
  Chave **cifrada em repouso**, nunca logada.
- **`billing_events`** — log idempotente dos webhooks do provedor. Mesmo padrão de claim
  atômico já usado em `budget_alert_notifications`.

## 2. Config de IA por usuário

Fecha um gap existente: hoje `config.googleApiKey` é "validado mas não injetado" e o
modelo é fixo no env. O design troca por um **resolver por mensagem**: dado
`{userId, spaceId}` → se `ai_mode = byo`, decifra a `ai_credentials` do usuário e usa a
key + modelo dele; se `nossa`, usa a key da plataforma (env) + `gemini-flash-latest`.

Isso exige montar o model/agent Mastra **por requisição** no `apps/agent` (hoje é global).
É o refactor central desta parte — pequeno e localizado, mas real.

## 3. Porteiro no agente (`apps/agent`, antes do `agent.generate`)

No `process-message`, antes de rodar o Mastra:

1. Reconcilia/cria o usuário pelo número (já existe).
2. Resolve a **assinatura efetiva** (a própria, ou uma de espaço que o cobre — ver §5).
3. Sem assinatura → cria trial (`trial_ends_at = agora + 7 dias`) e processa.
4. Trial válido ou pago → processa normal.
5. Trial vencido / cancelado / atrasado além de 3 dias → **mensagem determinística** com
   link de assinatura, **sem passar pela IA**.
6. BYO com key inválida/sem quota → mensagem determinística "sua chave parou, atualiza
   aqui".

As mensagens de bloqueio são determinísticas (string server-side), não passam pelo LLM —
não gastam token nem correm risco de alucinação.

## 4. Telas (`apps/web`)

Já existe Better Auth com o número como identidade.

- `/precos` — pública, os 4 combos.
- Checkout → redirect via a interface `PaymentProvider`.
- `/app/assinatura` — status, contador de trial, gerenciar/cancelar, upgrade para espaço.
- `/app/configuracoes/ia` — colar key BYO + status de validação (testa a key com uma
  chamada real).
- `/api/billing/webhook` — atualiza status idempotente (via `billing_events`).

## 5. Regra do híbrido (individual vs espaço)

- Individual cobre só aquele número.
- Compartilhar espaço → o dono faz upgrade para `tier = espaco`; a assinatura de espaço
  cobre **todos os membros** daquele espaço.
- **Ordem de resolução de acesso:** existe assinatura de espaço ativa cobrindo esse
  número? → usa ela. Senão, a individual dele? → usa. Senão → trial/bloqueio.
- **Edges v1 (simples):** membro sai do espaço → perde cobertura, cai para a própria
  assinatura/trial. Dono cancela o plano de espaço → membros perdem cobertura.
- Encaixa no modelo B existente (transação por `created_by`, visibilidade por
  participação). A cobertura de billing é uma camada por cima, não mexe nas transações.

## 6. Provedor de pagamento — abstrato

Escolha adiada de propósito. Interface `PaymentProvider` (checkout, webhook de status,
cancelar) isola o resto do sistema do provedor concreto. Permite rodar mais de um em
paralelo e medir conversão.

Comparação de taxas levantada (2026), relevante por ser ticket baixo:

- **Appmax:** cartão 3,49% (sem fixo), Pix 0,99%, D+30; Pix Automático "em
  desenvolvimento".
- **Mercado Pago:** cartão 3,98% (D+30) / 4,98% (na hora), Pix 0,99%; recorrência nativa
  madura.
- **Stripe:** cartão 3,99% + R$0,39 fixo (o fixo come ~8% do plano de R$9,99), Pix 1,19%.

Ponto estrutural: cobrança recorrente automática é trivial no cartão; no Pix depende do
Pix Automático, ainda irregular entre provedores. Candidatos para começar: Appmax (menor
taxa de cartão) ou Mercado Pago (confiança + recorrência madura). Stripe fica de fora pelo
fixo no ticket baixo, salvo se a maioria for Pix.

## Plano de migração faseado

Isto é um programa, não um único spec. Cada fase terá seu próprio ciclo
spec → plano → implementação.

- **Fase 0 — pré-requisito (CONCLUÍDA):** normalizar números em prod.
- **Fase 1 — multi-tenancy sem dinheiro (ESCOPO DESTE CICLO):** schema de assinatura
  (`subscriptions`) + resolver de acesso + porteiro com trial + injeção de IA por usuário
  (fecha o gap do `googleApiKey`). Atrás de feature-flag. Sem provedor de pagamento e sem
  BYO. É a fundação e não depende de nenhuma decisão externa.
- **Fase 2 — pagamento:** interface `PaymentProvider` + 1 provedor concreto + webhook +
  telas de checkout/assinatura. Trial passa a vencer e bloquear de verdade; dunning de
  3 dias.
- **Fase 3 — BYO:** `ai_credentials` cifrada + tela de config + validação + resolver
  usando a key do usuário. Planos de R$9,99 / R$14,99 ligados.
- **Fase 4 — plano de espaço:** upgrade híbrido + regras de cobertura (§5).
- **Fase 5 — endurecimento:** anti-ban do número único (rate limit), dunning ativo
  (lembrete no próprio WhatsApp), observabilidade de billing.

## Escopo da Fase 1 (o que será implementado agora)

1. Migration + schema Drizzle de `subscriptions` (sem `ai_credentials` nem
   `billing_events` ainda — entram nas Fases 3 e 2).
2. Repository: `getEffectiveSubscription(number)` com a ordem de resolução do §5
   (individual apenas por enquanto; cobertura de espaço vem na Fase 4, mas a assinatura de
   espaço já pode existir no schema).
3. `ensureTrial(userId)` idempotente (cria trial de 7 dias no primeiro contato).
4. Porteiro no `process-message` do `apps/agent` (passos 1–5 do §3; passo 6 do BYO fica
   para a Fase 3), atrás de feature-flag.
5. Resolver de IA por requisição no `apps/agent`: monta o model Mastra por mensagem lendo
   o `ai_mode` da assinatura (na Fase 1, sempre `nossa` → key da plataforma; a estrutura
   já fica pronta para BYO).
6. Testes: resolução de assinatura (trial ativo/vencido/inexistente), criação idempotente
   de trial, porteiro bloqueando com mensagem determinística quando vencido.

Fora do escopo da Fase 1: qualquer integração de pagamento, telas de billing, BYO,
criptografia de chave, cobertura de espaço.
