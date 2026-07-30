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
        <section className="card p-5" style={{ borderColor: "var(--accent)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">Convites recebidos</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {convites.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3" style={{ background: "var(--surface-2)" }}>
                <span className="text-sm font-medium text-fg">Convite para compartilhar um espaço</span>
                <form action={aceitar}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn-accent px-4 py-1.5 text-xs">Aceitar</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-soft">Membros</h2>
        <ul className="mt-3 flex flex-col">
          {membros.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
              <Avatar name={m.name} />
              <span className="flex-1 text-sm font-medium text-fg">{m.name ?? "Sem nome"}</span>
              <span
                className="badge text-accent"
                style={{ background: m.role === "owner" ? "var(--accent-soft)" : "var(--surface-2)", color: m.role === "owner" ? "var(--accent)" : "var(--muted)" }}
              >
                {m.role === "owner" ? "Dono" : "Membro"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-soft">Convidar alguém</h2>
        <p className="mt-1 text-sm text-muted">A pessoa recebe um aviso no WhatsApp e passa a ver e lançar gastos neste espaço.</p>
        <form action={convidar} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input name="numero" placeholder="WhatsApp (ex: 51 99999-9999)" className="field flex-1" />
          <button className="btn-accent shrink-0">Enviar convite</button>
        </form>
      </section>
    </div>
  );
}
