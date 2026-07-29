import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { getSpaceMembers, getPendingInvitationsForNumber } from "@ia/db";
import { convidar, aceitar } from "./actions";

export default async function EspacosPage() {
  const ctx = await requireContext();
  const membros = await getSpaceMembers(db, ctx.spaceId);
  const convites = ctx.phoneNumber ? await getPendingInvitationsForNumber(db, ctx.phoneNumber) : [];

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-xl font-bold">Membros do espaco</h1>
        <ul className="mt-2">
          {membros.map((m) => (
            <li key={m.userId} className="flex justify-between border-b py-2">
              <span>{m.name ?? "Sem nome"}</span>
              <span className="text-gray-500">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Convidar</h2>
        <form action={convidar} className="mt-2 flex gap-2">
          <input name="numero" placeholder="Numero (ex: 5511999999999)" className="flex-1 rounded border p-2" />
          <button className="rounded bg-black px-4 text-white">Convidar</button>
        </form>
      </section>

      {convites.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold">Convites recebidos</h2>
          <ul className="mt-2">
            {convites.map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b py-2">
                <span>Convite para um espaco</span>
                <form action={aceitar}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="rounded bg-green-600 px-3 py-1 text-white">Aceitar</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
