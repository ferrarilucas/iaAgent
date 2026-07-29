# apps/web (painel) — Documento de Design

**Data:** 2026-07-29
**Status:** Aprovado (design), pronto para plano(s) de implementação
**Depende de:** `packages/db` e `apps/agent` já mergeados; spec macro
[2026-07-28-agente-financeiro-whatsapp-design.md](2026-07-28-agente-financeiro-whatsapp-design.md).

## Objetivo

Um painel web para visualizar e gerenciar o controle financeiro: ver transações,
gráficos, gerenciar espaços/convites (o vínculo entre usuários mora aqui) e definir
limites de gasto por categoria (pessoal e do espaço) com aviso. Login por OTP no
WhatsApp. É o segundo consumidor do banco, ao lado do agente.

## Escopo do v1

Telas: **Login (OTP)**, **Espaços & convites** (criar espaço, convidar por número,
aceitar/recusar, ver membros, sair), **Transações** (listar/filtrar por período,
categoria, tipo, quem lançou), **Dashboard** (gráficos: gastos por categoria, por
mês, totais), **Limites** (pessoal e do espaço, CRUD por categoria + barra
gasto/limite).

Fora do v1: editar/apagar transação arbitrária no painel; adicionar transação
manual; alertas por cron; relatórios exportáveis.

## Arquitetura (o painel é cross-cutting)

| Peça | Mudança |
|---|---|
| `packages/whatsapp` (novo) | extrai o `evolution.ts` do agente; agente e painel importam. Gateway compartilhado (um lugar só pra trocar Evolution -> Cloud API) |
| `packages/db` | estende `users` para Better Auth + tabelas de sessão do Better Auth; nova tabela `budgets`; migrations; funções de repo novas |
| `apps/web` (novo) | Next.js: auth, telas, gráficos |
| `apps/agent` | passa a importar de `packages/whatsapp`; ganha o alerta de limite no registro |

## Autenticação

Better Auth com o adapter do Drizzle, usando a **nossa tabela `users` única**
(estendida), não uma paralela. Plugin de phone-OTP: gera o código, entrega via
`packages/whatsapp` (`sendText`), verifica, abre sessão por cookie. Quando a pessoa
loga pelo número, o Better Auth encontra o `users` que o agente já criou (mesma
tabela) — sem duplicar. Login social fica pronto para o futuro (adicionar provider).

O Better Auth cria suas tabelas de infraestrutura (`session`, `account`,
`verification`) — não são "tabela de users", é o encanamento de sessão/providers. A
única tabela de usuário continua sendo a nossa.

## Modelo de dados novo

```
budgets
  id, category_id (FK categories), amount (numeric, teto mensal),
  scope ('user' | 'space'),
  user_id  (FK users, quando scope='user'; considera transactions.created_by = user_id),
  space_id (FK spaces, quando scope='space'; considera todos os membros do espaco),
  created_at
```

Regras:
- `scope='user'` -> `user_id` preenchido, `space_id` nulo. `scope='space'` -> o inverso.
- Uma categoria pode ter simultaneamente 1 limite pessoal (por user) e 1 do espaco.
- `amount` é `numeric` (dinheiro como string), teto **mensal**.

Extensão de `users` (para Better Auth): adicionar `email` (nullable), `emailVerified`
(bool default false), `phoneNumber` (mapeia/espelha `whatsapp_number`),
`phoneNumberVerified` (bool default false), `updatedAt` (timestamptz). O
`bootstrapUser` do agente passa a preencher os defaults e `phoneNumber` = número, e
segue compatível.

## Limites & alertas

- **Painel:** seção "Meus limites" (pessoal, escopo `user`) e "Limites do espaço"
  (escopo `space`). CRUD por categoria + barra de progresso (gasto do mês / limite),
  com cor mudando ao se aproximar do teto.
- **Agente, no momento do registro (sem cron):** ao registrar uma transação, o agente
  lê os limites da categoria e computa o gasto do mês:
  - **limite pessoal** cruzado (soma de `created_by` = usuário) -> alerta emendado na
    confirmação do próprio usuário;
  - **limite do espaço** cruzado (soma de todos os membros) -> alerta na confirmação do
    usuário **e** um push via `packages/whatsapp` (`sendText`) para cada **outro** membro
    do espaço.
  - "Cruzado" cobre atingir/ultrapassar um patamar (ex.: 80% e 100%); o patamar exato é
    detalhe de implementação. Tudo disparado pelo evento de registro — sem agendador.

## Stack do painel

- **Next.js (App Router)** + TypeScript strict.
- Acesso a dados via **`packages/db` diretamente** em server actions / route handlers
  (o painel é server-side e o `db` é server-only; sem API separada).
- **Recharts** para gráficos (client components).
- **Tailwind** para estilo.
- Better Auth: handler no Next.js + adapter Drizzle sobre `packages/db`.

## Deploy

App próprio no Coolify (mesmo VPS, mesmo Postgres): Build Pack Dockerfile, Base
Directory `/`, Dockerfile `/apps/web/Dockerfile`, porta 3000, comando `pnpm start:web`
(sem migrations — só o agente migra), **Watch Paths** `apps/web/**` + `packages/**`
(deploy independente do agente). O `start:web` já existe na raiz.

## Testes

- `packages/db`: budgets (CRUD) e a função de status de limite (gasto vs teto por
  categoria/escopo/mês) com PGlite.
- `packages/whatsapp`: os mesmos testes que já existiam para `evolution.ts` (movidos).
- `apps/agent`: a lógica de alerta de limite no registro, com Gemini/Evolution mockados.
- `apps/web`: testes leves onde valer (as funções puras de dados; auth e telas
  verificadas com o essencial). O foco de teste é a lógica de dados, não pixel.

## Fatiamento em planos

Grande demais para um plano só; três planos em sequência:
1. **Fundação compartilhada** — extrair `packages/whatsapp` (mover `evolution.ts` +
   testes; agente passa a importar de lá) e estender `packages/db` (users para Better
   Auth + tabela `budgets` + funções de repo: budgets CRUD, status de limite, listar
   membros com nome). Não muda comportamento do agente além dos imports.
2. **`apps/web`** — scaffolding Next.js + Better Auth OTP + telas (espaços/convites,
   transações, dashboard, limites CRUD) + Dockerfile + deploy.
3. **Alertas de limite no agente** — o retoque no registro (pessoal + espaço + push aos
   outros membros), consumindo a tabela `budgets`.

## Riscos

1. **Better Auth sobre tabela existente** — adotar o `users` já criado (uuid, colunas
   extras) via adapter Drizzle exige mapear o schema do Better Auth ao nosso; validar
   cedo que o phone-OTP encontra o usuário criado pelo agente sem duplicar.
2. **Extração do `packages/whatsapp`** — o agente já usa `evolution.ts`; mover deve
   manter os testes verdes (rede de segurança) e os imports do agente.
3. **Consistência de "mês"** — o cálculo de gasto do mês para limites deve usar o mesmo
   fuso (America/Sao_Paulo) já usado na injeção de data do agente.

## Fora de escopo

- Editar/apagar transação arbitrária no painel; adicionar transação manual.
- Alertas proativos por cron (o alerta no registro cobre o caso).
- Billing/planos, multi-idioma, exportação.
