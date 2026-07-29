import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { listTransactionsForSpace, listCategoriesForSpace, getSpaceMembers } from "@ia/db";

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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Transacoes</h1>
      <form className="flex flex-wrap gap-2" method="get">
        <input type="date" name="from" defaultValue={sp.from ?? ""} className="rounded border p-2" />
        <input type="date" name="to" defaultValue={sp.to ?? ""} className="rounded border p-2" />
        <select name="type" defaultValue={type ?? ""} className="rounded border p-2">
          <option value="">Todos</option>
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
        </select>
        <button className="rounded bg-black px-4 text-white">Filtrar</button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2">Data</th><th>Tipo</th><th>Categoria</th><th>Descricao</th><th>Quem</th><th className="text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-2">{t.occurredAt}</td>
              <td>{t.type}</td>
              <td>{t.categoryId ? catName.get(t.categoryId) ?? "-" : "-"}</td>
              <td>{t.description ?? ""}</td>
              <td>{memberName.get(t.createdBy) ?? "?"}</td>
              <td className="text-right">R$ {t.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {txs.length === 0 ? <p className="text-gray-500">Nenhum lancamento no filtro.</p> : null}
    </div>
  );
}
