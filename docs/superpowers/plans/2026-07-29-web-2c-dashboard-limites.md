# apps/web — Plano 2c (Dashboard + Limites) — Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as telas do painel: um Dashboard com gráfico de gastos por categoria no mês + totais, e a tela de Limites (pessoal e do espaço) com CRUD por categoria e barra de progresso gasto/teto.

**Architecture:** Server Components fazem as consultas via `packages/db`; um único client component (Recharts) recebe os dados prontos para desenhar o gráfico. As funções de repo de budgets e o `getBudgetStatus` já existem — o painel só orquestra. O "mês" é calculado no fuso America/Sao_Paulo (consistente com o agente).

**Tech Stack:** Next.js (App Router), TypeScript strict, Tailwind, Recharts (client), `@ia/db`, Better Auth (sessão).

## Global Constraints

- **NUNCA adicionar comentários no código** — nenhum `.ts`/`.tsx`.
- **TypeScript strict.** Dinheiro é string; `Number(...)` só para display (altura de barra / largura de progresso), nunca persistido nem para valores gravados.
- **Toda rota `/app/*` exige sessão** via `requireContext()` (já existe em `apps/web/src/lib/session.ts`, retorna `{ userId, spaceId, userName, phoneNumber }`).
- **Mês no fuso America/Sao_Paulo.**
- **Env placeholder pro build** (env.ts parseia no load):
  `DATABASE_URL="postgresql://ia:ia@localhost:5432/ia_agent" BETTER_AUTH_SECRET="dev" BETTER_AUTH_URL="http://localhost:3000" EVOLUTION_API_URL="https://evo.example" EVOLUTION_INSTANCE="inst" EVOLUTION_API_KEY="key"`
- Não desfazer auth/telas anteriores. Commits frequentes, um por tarefa.

## Funções de `packages/db` já existentes (consumidas aqui)

- `sumByCategory(db, spaceId, { from, to, type })` → `Array<{ categoryId: string | null; total: string }>`
- `listCategoriesForSpace(db, spaceId)` → `Array<{ id; name; type }>`
- `listBudgetsForUser(db, userId)`, `listBudgetsForSpace(db, spaceId)` → `Budget[]`
- `getBudgetStatus(db, budget, from, to)` → `{ limit: string; spent: string; ratio: number }`
- `createBudget(db, { categoryId, amount, scope, userId?, spaceId? })`, `updateBudget(db, id, { amount })`, `deleteBudget(db, id)`

---

## Estrutura de arquivos

```
apps/web/src/
  lib/month.ts                       currentMonthRange() -> { from, to } (YYYY-MM-DD, fuso SP)
  components/category-bar-chart.tsx  client component (Recharts)
  app/app/page.tsx                   Dashboard (substitui o placeholder)
  app/app/limites/page.tsx           tela de limites
  app/app/limites/actions.ts         criar/atualizar/apagar budget
  app/app/layout.tsx                 + link "Limites" na nav
apps/web/package.json                + recharts
```

---

### Task 1: Setup — Recharts, helper de mês e o componente de gráfico

**Files:**
- Modify: `apps/web/package.json` (+ recharts)
- Create: `apps/web/src/lib/month.ts`
- Create: `apps/web/src/components/category-bar-chart.tsx`

**Interfaces:**
- Produces:
  - `currentMonthRange(): { from: string; to: string }` — primeiro e último dia do mês corrente em `YYYY-MM-DD`, fuso America/Sao_Paulo.
  - `CategoryBarChart({ data }: { data: Array<{ name: string; total: number }> })` — client component que desenha um bar chart.

- [ ] **Step 1: Adicionar `recharts` ao `apps/web/package.json`**

Adicionar em dependencies (mantendo as demais):
```json
    "recharts": "^2.12.0",
```
Rodar `pnpm install`. Se a versão não resolver com React 19, instale a atual estável compatível (`pnpm --filter @ia/web add recharts@latest`) e registre a versão.

- [ ] **Step 2: Criar `apps/web/src/lib/month.ts`**

```ts
export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}
```

- [ ] **Step 3: Criar `apps/web/src/components/category-bar-chart.tsx`**

```tsx
"use client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CategoryBarChart({ data }: { data: Array<{ name: string; total: number }> }) {
  if (data.length === 0) {
    return <p className="text-gray-500">Sem gastos no mes.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="name" fontSize={12} />
          <YAxis fontSize={12} />
          <Tooltip />
          <Bar dataKey="total" fill="#111827" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @ia/web typecheck && <env placeholder> pnpm --filter @ia/web build`
Expected: build conclui; typecheck limpo. Se o Recharts reclamar de tipos com React 19, ajuste a versão/tipos até compilar e registre.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/month.ts apps/web/src/components/category-bar-chart.tsx pnpm-lock.yaml
git commit -m "feat(web): recharts, helper de mes e componente de grafico"
```

---

### Task 2: Dashboard (gastos por categoria no mês + totais)

**Files:**
- Modify: `apps/web/src/app/app/page.tsx` (substitui o placeholder pós-login)

**Interfaces:**
- Consumes: `requireContext`, `db`, `currentMonthRange`, `sumByCategory`, `listCategoriesForSpace`, `CategoryBarChart`.

- [ ] **Step 1: Substituir `apps/web/src/app/app/page.tsx`**

```tsx
import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { sumByCategory, listCategoriesForSpace } from "@ia/db";
import { currentMonthRange } from "@/lib/month";
import { CategoryBarChart } from "@/components/category-bar-chart";

export default async function DashboardPage() {
  const ctx = await requireContext();
  const { from, to } = currentMonthRange();
  const [porCategoria, cats] = await Promise.all([
    sumByCategory(db, ctx.spaceId, { from, to, type: "despesa" }),
    listCategoriesForSpace(db, ctx.spaceId),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const data = porCategoria.map((r) => ({
    name: r.categoryId ? catName.get(r.categoryId) ?? "outros" : "outros",
    total: Number(r.total),
  }));
  const totalMes = porCategoria.reduce((acc, r) => acc + Number(r.total), 0).toFixed(2);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Ola, {ctx.userName ?? "por aqui"} 👋</h1>
        <p className="text-gray-600">Gastos do mes: <span className="font-semibold">R$ {totalMes}</span></p>
      </div>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Gastos por categoria</h2>
        <CategoryBarChart data={data} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter @ia/web typecheck && <env placeholder> pnpm --filter @ia/web build`
Expected: build conclui; `/app` continua como rota. Reconcilie se algum tipo do `@ia/db` divergir.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/app/page.tsx
git commit -m "feat(web): dashboard com gastos por categoria do mes"
```

---

### Task 3: Tela de Limites (pessoal e do espaço) com progresso

**Files:**
- Create: `apps/web/src/app/app/limites/actions.ts`
- Create: `apps/web/src/app/app/limites/page.tsx`
- Modify: `apps/web/src/app/app/layout.tsx` (+ link "Limites")

**Interfaces:**
- Consumes: `requireContext`, `db`, `@ia/db` (`listCategoriesForSpace`, `listBudgetsForUser`, `listBudgetsForSpace`, `getBudgetStatus`, `createBudget`, `deleteBudget`), `currentMonthRange`.
- Produces: actions `criarLimite(formData)`, `apagarLimite(formData)`; a tela.

- [ ] **Step 1: Criar `apps/web/src/app/app/limites/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createBudget, deleteBudget } from "@ia/db";
import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";

export async function criarLimite(formData: FormData) {
  const ctx = await requireContext();
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = String(formData.get("amount") ?? "").trim();
  const scope = formData.get("scope") === "space" ? "space" : "user";
  if (!categoryId || !amount) return;
  await createBudget(db, {
    categoryId,
    amount,
    scope,
    userId: scope === "user" ? ctx.userId : undefined,
    spaceId: scope === "space" ? ctx.spaceId : undefined,
  });
  revalidatePath("/app/limites");
}

export async function apagarLimite(formData: FormData) {
  await requireContext();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteBudget(db, id);
  revalidatePath("/app/limites");
}
```

- [ ] **Step 2: Criar `apps/web/src/app/app/limites/page.tsx`**

```tsx
import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { listCategoriesForSpace, listBudgetsForUser, listBudgetsForSpace, getBudgetStatus, type Budget } from "@ia/db";
import { currentMonthRange } from "@/lib/month";
import { criarLimite, apagarLimite } from "./actions";

function cor(ratio: number): string {
  if (ratio >= 1) return "bg-red-600";
  if (ratio >= 0.8) return "bg-yellow-500";
  return "bg-green-600";
}

async function LinhaLimite({ budget, nome, from, to }: { budget: Budget; nome: string; from: string; to: string }) {
  const st = await getBudgetStatus(db, budget, from, to);
  const pct = Math.min(100, Math.round(st.ratio * 100));
  return (
    <li className="border-b py-3">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{nome}</span>
        <span className="text-gray-600">R$ {st.spent} / R$ {st.limit}</span>
      </div>
      <div className="mt-1 h-2 w-full rounded bg-gray-200">
        <div className={`h-2 rounded ${cor(st.ratio)}`} style={{ width: `${pct}%` }} />
      </div>
      <form action={apagarLimite} className="mt-1 text-right">
        <input type="hidden" name="id" value={budget.id} />
        <button className="text-xs text-red-600">apagar</button>
      </form>
    </li>
  );
}

export default async function LimitesPage() {
  const ctx = await requireContext();
  const { from, to } = currentMonthRange();
  const [cats, pessoais, doEspaco] = await Promise.all([
    listCategoriesForSpace(db, ctx.spaceId),
    listBudgetsForUser(db, ctx.userId),
    listBudgetsForSpace(db, ctx.spaceId),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const despesaCats = cats.filter((c) => c.type === "despesa");

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-xl font-bold">Novo limite</h1>
        <form action={criarLimite} className="mt-2 flex flex-wrap gap-2">
          <select name="categoryId" className="rounded border p-2">
            {despesaCats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <input name="amount" placeholder="Valor (ex: 300.00)" className="rounded border p-2" />
          <select name="scope" className="rounded border p-2">
            <option value="user">Pessoal</option>
            <option value="space">Do espaco</option>
          </select>
          <button className="rounded bg-black px-4 text-white">Criar</button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Meus limites</h2>
        <ul>{pessoais.map((b) => (<LinhaLimite key={b.id} budget={b} nome={b.categoryId ? catName.get(b.categoryId) ?? "-" : "-"} from={from} to={to} />))}</ul>
        {pessoais.length === 0 ? <p className="text-gray-500">Nenhum limite pessoal.</p> : null}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Limites do espaco</h2>
        <ul>{doEspaco.map((b) => (<LinhaLimite key={b.id} budget={b} nome={b.categoryId ? catName.get(b.categoryId) ?? "-" : "-"} from={from} to={to} />))}</ul>
        {doEspaco.length === 0 ? <p className="text-gray-500">Nenhum limite do espaco.</p> : null}
      </section>
    </div>
  );
}
```
Nota: `Budget.categoryId` é `string` (não-nulo no schema); o `?:` acima é defensivo. Reconcilie o tipo se o `@ia/db` expuser diferente.

- [ ] **Step 3: Adicionar o link "Limites" na nav — `apps/web/src/app/app/layout.tsx`**

Na `<nav>`, acrescentar após o link de Espaços:
```tsx
          <Link href="/app/limites">Limites</Link>
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter @ia/web typecheck && <env placeholder> pnpm --filter @ia/web build`
Expected: build lista `/app/limites`; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/app/limites apps/web/src/app/app/layout.tsx
git commit -m "feat(web): tela de limites (pessoal e do espaco) com progresso"
```

---

## Self-Review (feito pelo autor do plano)

**Cobertura (2c):**
- Dashboard: gastos por categoria no mês (Recharts) + total do mês → Tasks 1, 2. ✔
- Mês no fuso America/Sao_Paulo → Task 1 (`currentMonthRange`). ✔
- Limites pessoal e do espaço: criar (categoria + valor + escopo), listar com barra gasto/teto (`getBudgetStatus`), apagar → Task 3. ✔
- Cor da barra muda perto/acima do teto (>=80% amarelo, >=100% vermelho) → Task 3 (`cor`). ✔
- Toda rota protegida por `requireContext` → Tasks 2, 3. ✔

**Fora deste plano:** editar valor do limite inline (só criar/apagar por ora — atualizar = apagar+criar); gráfico por mês ao longo do tempo (só o mês corrente); alerta no WhatsApp (é o Plano 3, no agente).

**Placeholders:** nenhum de escopo; onde Recharts/React 19 podem divergir de versão há instrução de reconciliação. Código concreto.

**Consistência de tipos:** `currentMonthRange(): { from, to }`, `CategoryBarChart({ data: {name,total:number}[] })`, e as funções do `@ia/db` (`sumByCategory`, `getBudgetStatus`, `createBudget`, `deleteBudget`, `listBudgetsForUser/Space`, `listCategoriesForSpace`) batem com as assinaturas existentes. `Number(...)` só em display (barra/altura), dinheiro segue string em `spent`/`limit`/`amount`.
