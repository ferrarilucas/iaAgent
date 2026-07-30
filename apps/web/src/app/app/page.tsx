import Link from "next/link";
import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { listTransactionsForSpace, listCategoriesForSpace, getSpaceMembers } from "@ia/db";
import { formatBRL, formatDate, currentMonthRange } from "@/lib/format";
import { PageHeader, StatCard, Avatar, EmptyState } from "@/components/ui";

export default async function AppHome() {
  const ctx = await requireContext();
  const mes = currentMonthRange();
  const [txs, cats, membros] = await Promise.all([
    listTransactionsForSpace(db, ctx.spaceId, { from: mes.from, to: mes.to }),
    listCategoriesForSpace(db, ctx.spaceId),
    getSpaceMembers(db, ctx.spaceId),
  ]);

  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const memberName = new Map(membros.map((m) => [m.userId, m.name ?? "?"]));

  const receitas = txs.filter((t) => t.type === "receita").reduce((s, t) => s + Number(t.amount), 0);
  const despesas = txs.filter((t) => t.type === "despesa").reduce((s, t) => s + Number(t.amount), 0);
  const saldo = receitas - despesas;

  const porCategoria = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== "despesa") continue;
    const nome = t.categoryId ? catName.get(t.categoryId) ?? "Outros" : "Outros";
    porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + Number(t.amount));
  }
  const topCategorias = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maiorCategoria = topCategorias[0]?.[1] ?? 0;

  const recentes = [...txs].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)).slice(0, 6);
  const primeiroNome = (ctx.userName ?? "").split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title={`Olá, ${primeiroNome || "por aqui"} 👋`} subtitle={`Resumo de ${mes.label}`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Receitas" value={formatBRL(receitas)} tone="success" />
        <StatCard label="Despesas" value={formatBRL(despesas)} tone="danger" />
        <StatCard
          label="Saldo do mês"
          value={formatBRL(saldo)}
          tone={saldo >= 0 ? "accent" : "danger"}
          hint={`${txs.length} lançamento${txs.length === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-soft">Gastos por categoria</h2>
          {topCategorias.length === 0 ? (
            <p className="mt-4 text-sm text-soft">Sem despesas neste mês.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3.5">
              {topCategorias.map(([nome, valor]) => (
                <li key={nome}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium capitalize text-fg">{nome}</span>
                    <span className="tabular-nums text-muted">{formatBRL(valor)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${maiorCategoria ? Math.max(6, (valor / maiorCategoria) * 100) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-soft">Últimos lançamentos</h2>
            <Link href="/app/transacoes" className="text-xs font-semibold text-accent hover:brightness-110">
              Ver todos →
            </Link>
          </div>
          {recentes.length === 0 ? (
            <p className="mt-4 text-sm text-soft">Nada por aqui ainda. Mande um gasto pra pilinha no WhatsApp 😉</p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {recentes.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0">
                  <Avatar name={memberName.get(t.createdBy)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {t.description || (t.categoryId ? catName.get(t.categoryId) ?? "Lançamento" : "Lançamento")}
                    </p>
                    <p className="text-xs text-soft">
                      {formatDate(t.occurredAt)} · {t.categoryId ? catName.get(t.categoryId) ?? "—" : "—"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${t.type === "receita" ? "text-success" : "text-danger"}`}>
                    {t.type === "receita" ? "+" : "−"} {formatBRL(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {txs.length === 0 ? (
        <EmptyState
          title="Comece registrando pelo WhatsApp"
          hint="Envie um áudio, foto do comprovante ou só escreva o gasto — a pilinha organiza tudo aqui."
        />
      ) : null}
    </div>
  );
}
