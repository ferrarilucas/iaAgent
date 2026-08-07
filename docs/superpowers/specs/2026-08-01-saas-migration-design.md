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

- **Asaas:** cartão 2,99% + R$0,49; Pix **R$1,99 fixo** (R$0,99 nos 3 primeiros meses);
  boleto R$3,49; +1,99% sobre o valor em cobranças de assinatura; **Pix Automático já
  lançado e funcionando**.

Ponto estrutural: cobrança recorrente automática é trivial no cartão; no Pix depende do
Pix Automático, ainda irregular entre provedores.

**DECISÃO (2026-08-03): Asaas.** Escolhido pelo dono do projeto. O fator decisivo é o Pix
Automático funcionando hoje — a Appmax ainda o lista como "em desenvolvimento".

Consequência econômica assumida conscientemente: a taxa de Pix do Asaas é **fixa**, não
percentual, então ela pesa desproporcionalmente no ticket baixo. No plano de R$9,99 via Pix,
R$1,99 é ~20% da receita (contra ~1% da Appmax); no de R$29,99, ~6,6%. Os pontos de virada
em que o Asaas passaria a ser mais barato são ~R$98 de ticket no cartão e ~R$201 no Pix —
ambos muito acima da nossa faixa. Ou seja: **no Asaas, o cartão é mais barato que o Pix para
os nossos preços**, o inverso do que vale na Appmax.

Implicações práticas para a Fase 2:
- Confirmar com o Asaas a **franquia de Pix grátis por mês** — as fontes públicas divergem
  entre "30" e "100 transações grátis". Se forem 100, os primeiros ~100 assinantes pagam
  Pix zero e a economia muda completamente na fase inicial. Verificar antes de modelar preço.
- Confirmar se o adicional de 1,99% de assinatura incide sobre cobrança recorrente em Pix ou
  só sobre parcelamento no cartão.
- Não empurrar Pix como default no checkout do plano de R$9,99 sem antes fechar os dois
  pontos acima — no Asaas isso pode custar mais caro que o cartão.
- A interface `PaymentProvider` continua valendo: a escolha não deve vazar para o resto do
  sistema, e trocar de provedor (ou rodar dois em paralelo) precisa seguir barato.

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

## Pré-condições para ligar `SUBSCRIPTIONS_ENABLED=true` em produção

Levantadas no review final da Fase 1. Nenhuma bloqueia o merge da fundação (a flag nasce
desligada), mas **todas bloqueiam o flip**:

1. **Backfill/grandfathering dos usuários existentes.** `ensureTrialSubscription` é o único
   caminho de criação de assinatura e sempre cria `trial` com 7 dias. No dia em que a flag
   for ligada, todo usuário que já usa o Pilinha há meses ganha um trial novo e é
   **bloqueado no oitavo dia**. Precisa de uma migration marcando os usuários pré-corte como
   `ativo`, ou de uma data de corte por `createdAt`.
2. **Cobertura de assinatura de espaço (Fase 4).** Sem ela, membros convidados de um espaço
   cujo dono paga são bloqueados individualmente.
3. **Gate no push proativo.** `pushSpaceBudgetAlerts` (`apps/agent/src/agent/space-alerts.ts`)
   manda mensagem aos outros membros sem consultar acesso — um usuário bloqueado continuaria
   recebendo alertas de limite pelo WhatsApp.
4. **Supressão de repetição da mensagem de bloqueio.** Hoje cada mensagem de um usuário
   bloqueado gera uma resposta; 20 mensagens viram 20 links de cobrança. Irritante e risco de
   ban (o rate limit anti-ban é Fase 5).

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
