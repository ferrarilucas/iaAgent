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
