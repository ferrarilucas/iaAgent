import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { getSpaceMembers, getPendingInvitationsForNumber } from "@ia/db";
import { PageHeader, Avatar } from "@/components/ui";
import { convidar, aceitar } from "./actions";

export default async function EspacosPage() {
  const ctx = await requireContext();
  const membros = await getSpaceMembers(db, ctx.spaceId);
  const convites = ctx.phoneNumber ? await getPendingInvitationsForNumber(db, ctx.phoneNumber) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Espaço" subtitle="Compartilhe as contas com quem você confia" />

      {convites.length > 0 ? (
        <section className="card border-gold-300 bg-gold-50/70 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold-700">Convites recebidos</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {convites.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-4 py-3">
                <span className="text-sm font-medium text-navy-800">Convite para compartilhar um espaço</span>
                <form action={aceitar}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn-gold px-4 py-1.5 text-xs">Aceitar</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Membros</h2>
        <ul className="mt-3 divide-y divide-cream-200">
          {membros.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-3">
              <Avatar name={m.name} />
              <span className="flex-1 text-sm font-medium text-navy-800">{m.name ?? "Sem nome"}</span>
              <span
                className={`badge ${
                  m.role === "owner" ? "bg-navy-100 text-navy-700" : "bg-cream-200 text-ink-muted"
                }`}
              >
                {m.role === "owner" ? "Dono" : "Membro"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Convidar alguém</h2>
        <p className="mt-1 text-sm text-ink-muted">
          A pessoa recebe um aviso no WhatsApp e passa a ver e lançar gastos neste espaço.
        </p>
        <form action={convidar} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input name="numero" placeholder="WhatsApp (ex: 51 99999-9999)" className="field flex-1" />
          <button className="btn-primary shrink-0">Enviar convite</button>
        </form>
      </section>
    </div>
  );
}
