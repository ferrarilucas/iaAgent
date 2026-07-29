FROM node:20-slim
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json packages/db/package.json
COPY packages/whatsapp/package.json packages/whatsapp/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "start:agent"]
