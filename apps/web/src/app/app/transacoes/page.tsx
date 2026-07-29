import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { listTransactionsForSpace, listCategoriesForSpace, getSpaceMembers } from "@ia/db";
import { formatBRL, formatDate } from "@/lib/format";
import { PageHeader, TypeBadge, Avatar, EmptyState } from "@/components/ui";

type Search = { from?: string; to?: string; type?: string };

export default async function TransacoesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const type = sp.type === "receita" || sp.type === "despesa" ? sp.type : undefined;
  const [txs, cats, membros] = await Promise.all([
    listTransactionsForSpace(db, ctx.spaceId, { from: sp.from, to: sp.to, type }),
    listCategoriesForSpace(db, ctx.spaceId),
    getSpaceMembers(db, ctx.spaceId),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const memberName = new Map(membros.map((m) => [m.userId, m.name ?? "?"]));
  const ordenadas = [...txs].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const total = ordenadas.reduce((s, t) => s + (t.type === "receita" ? 1 : -1) * Number(t.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Transações" subtitle="Tudo que entra e sai do seu espaço" />

      <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          De
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="field" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Até
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="field" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Tipo
          <select name="type" defaultValue={type ?? ""} className="field">
            <option value="">Todos</option>
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </select>
        </label>
        <button className="btn-primary">Filtrar</button>
      </form>

      {ordenadas.length === 0 ? (
        <EmptyState title="Nenhum lançamento no filtro" hint="Ajuste o período ou o tipo acima." />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="hidden grid-cols-[1fr_auto] items-center justify-between gap-2 border-b border-cream-200 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft sm:grid sm:grid-cols-[5rem_7rem_1fr_9rem_7rem]">
            <span>Data</span>
            <span>Tipo</span>
            <span>Descrição / Categoria</span>
            <span>Quem</span>
            <span className="text-right">Valor</span>
          </div>
          <ul className="divide-y divide-cream-200">
            {ordenadas.map((t) => (
              <li
                key={t.id}
                className="grid grid-cols-1 gap-1 px-5 py-3 transition-colors hover:bg-cream-50 sm:grid-cols-[5rem_7rem_1fr_9rem_7rem] sm:items-center sm:gap-2"
              >
                <span className="text-sm tabular-nums text-ink-muted">{formatDate(t.occurredAt)}</span>
                <span>
                  <TypeBadge type={t.type} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-navy-800">
                    {t.description || (t.categoryId ? catName.get(t.categoryId) ?? "Lançamento" : "Lançamento")}
                  </span>
                  {t.description && t.categoryId ? (
                    <span className="text-xs capitalize text-ink-soft">{catName.get(t.categoryId) ?? ""}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2 text-sm text-ink-muted">
                  <Avatar name={memberName.get(t.createdBy)} />
                  <span className="hidden truncate sm:inline">{memberName.get(t.createdBy) ?? "?"}</span>
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums sm:text-right ${
                    t.type === "receita" ? "text-success" : "text-danger"
                  }`}
                >
                  {t.type === "receita" ? "+" : "−"} {formatBRL(t.amount)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-cream-200 bg-cream-50 px-5 py-3 text-sm">
            <span className="text-ink-muted">
              {ordenadas.length} lançamento{ordenadas.length === 1 ? "" : "s"}
            </span>
            <span className={`font-semibold tabular-nums ${total >= 0 ? "text-navy-800" : "text-danger"}`}>
              Saldo: {formatBRL(total)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
