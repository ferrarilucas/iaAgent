import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { listCategoriesForSpace, listBudgetsForUser, listBudgetsForSpace, getBudgetStatus, type Budget } from "@ia/db";
import { formatBRL, currentMonthRange } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui";
import { criarLimite, atualizarLimite, apagarLimite } from "./actions";

function barra(ratio: number): string {
  if (ratio >= 1) return "bg-danger";
  if (ratio >= 0.8) return "bg-accent";
  return "bg-success";
}

function texto(ratio: number): string {
  if (ratio >= 1) return "text-danger";
  if (ratio >= 0.8) return "text-accent";
  return "text-success";
}

async function LinhaLimite({ budget, nome, from, to }: { budget: Budget; nome: string; from: string; to: string }) {
  const st = await getBudgetStatus(db, budget, from, to);
  const pct = Math.round(st.ratio * 100);
  const width = Math.min(100, pct);
  return (
    <li className="border-t border-line py-3.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium capitalize text-fg">{nome}</span>
        <span className="shrink-0 text-sm tabular-nums text-muted">
          {formatBRL(st.spent)} <span className="text-soft">/ {formatBRL(st.limit)}</span>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
          <div className={`h-full rounded-full ${barra(st.ratio)}`} style={{ width: `${width}%` }} />
        </div>
        <span className={`w-12 shrink-0 text-right text-xs font-semibold tabular-nums ${texto(st.ratio)}`}>{pct}%</span>
      </div>
      <details className="group mt-1.5">
        <summary className="cursor-pointer list-none text-xs font-medium text-soft transition hover:text-fg">Ajustar</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <form action={atualizarLimite} className="flex items-center gap-2">
            <input type="hidden" name="id" value={budget.id} />
            <input name="amount" inputMode="decimal" placeholder="Novo valor" className="field w-36 py-1.5" />
            <button className="btn-soft px-3 py-1.5 text-xs">Salvar</button>
          </form>
          <form action={apagarLimite}>
            <input type="hidden" name="id" value={budget.id} />
            <button className="btn-ghost px-3 py-1.5 text-xs text-danger">Apagar</button>
          </form>
        </div>
      </details>
    </li>
  );
}

function Secao({ titulo, budgets, catName, from, to, vazio }: {
  titulo: string;
  budgets: Budget[];
  catName: Map<string, string>;
  from: string;
  to: string;
  vazio: string;
}) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-soft">{titulo}</h2>
      {budgets.length === 0 ? (
        <p className="mt-3 text-sm text-soft">{vazio}</p>
      ) : (
        <ul className="mt-2">
          {budgets.map((b) => (
            <LinhaLimite key={b.id} budget={b} nome={catName.get(b.categoryId) ?? "—"} from={from} to={to} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function LimitesPage() {
  const ctx = await requireContext();
  const mes = currentMonthRange();
  const [cats, pessoais, doEspaco] = await Promise.all([
    listCategoriesForSpace(db, ctx.spaceId),
    listBudgetsForUser(db, ctx.userId),
    listBudgetsForSpace(db, ctx.spaceId),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const despesaCats = cats.filter((c) => c.type === "despesa");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Limites" subtitle={`Tetos de gasto por categoria · ${mes.label}`} />

      <section className="card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-soft">Novo limite</h2>
        <form action={criarLimite} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted">
              Categoria
              <select name="categoryId" className="field capitalize">
                {despesaCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:w-40">
              Valor do teto
              <input name="amount" inputMode="decimal" placeholder="ex: 300 ou 1.500,00" className="field" />
            </label>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1 text-xs font-medium text-muted">
              Escopo
              <div className="flex gap-1 rounded-2xl p-1" style={{ background: "var(--surface-2)" }}>
                <label className="cursor-pointer">
                  <input type="radio" name="scope" value="user" defaultChecked className="peer sr-only" />
                  <span className="block rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition peer-checked:bg-accent peer-checked:text-accent-fg">
                    Pessoal
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input type="radio" name="scope" value="space" className="peer sr-only" />
                  <span className="block rounded-xl px-3 py-1.5 text-sm font-medium text-muted transition peer-checked:bg-accent peer-checked:text-accent-fg">
                    Do espaço
                  </span>
                </label>
              </div>
            </div>
            <button className="btn-accent">Criar limite</button>
          </div>
        </form>
      </section>

      {despesaCats.length === 0 ? (
        <EmptyState title="Sem categorias de despesa" hint="As categorias padrão são criadas no primeiro acesso." />
      ) : null}

      <Secao
        titulo="Meus limites"
        budgets={pessoais}
        catName={catName}
        from={mes.from}
        to={mes.to}
        vazio="Nenhum limite pessoal ainda. Crie um acima — só os seus gastos contam."
      />
      <Secao
        titulo="Limites do espaço"
        budgets={doEspaco}
        catName={catName}
        from={mes.from}
        to={mes.to}
        vazio="Nenhum limite do espaço. Vale pra soma de todos os membros."
      />
    </div>
  );
}
