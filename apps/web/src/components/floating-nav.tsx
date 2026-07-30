"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PilinhaMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { SignOut } from "./sign-out";
import { HomeIcon, ListIcon, UsersIcon, PlusIcon, WhatsappIcon } from "./icons";

const items = [
  { href: "/app", label: "Início", Icon: HomeIcon },
  { href: "/app/transacoes", label: "Transações", Icon: ListIcon },
  { href: "/app/espacos", label: "Espaços", Icon: UsersIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function FloatingNav() {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const wpp = process.env.NEXT_PUBLIC_PILINHA_WHATSAPP;

  return (
    <>
      <aside className="fixed left-4 top-1/2 z-30 hidden -translate-y-1/2 md:block">
        <div className="glass flex flex-col items-center gap-1 rounded-3xl px-2 py-3">
          <Link href="/app" aria-label="pilinha" className="mb-2">
            <PilinhaMark className="h-8 w-auto" />
          </Link>
          {items.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={label}
                className={`group relative flex h-11 w-11 items-center justify-center rounded-2xl transition ${
                  active ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface2 hover:text-fg"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-fg px-2 py-1 text-xs font-medium text-canvas opacity-0 shadow transition group-hover:opacity-100">
                  {label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setSheet(true)}
            aria-label="Lançar"
            title="Lançar"
            className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow transition hover:brightness-105"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
          <div className="my-2 h-px w-8 bg-line" />
          <ThemeToggle />
          <SignOut />
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="glass flex items-end gap-1 rounded-full px-2 py-2">
          <BarItem pathname={pathname} {...items[0]} />
          <BarItem pathname={pathname} {...items[1]} />
          <button
            onClick={() => setSheet(true)}
            aria-label="Lançar"
            className="mx-1 -mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg ring-4 ring-canvas transition active:scale-95"
          >
            <PlusIcon className="h-6 w-6" />
          </button>
          <BarItem pathname={pathname} {...items[2]} />
        </div>
      </nav>

      {sheet ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <button aria-label="Fechar" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSheet(false)} />
          <div className="glass relative m-3 w-full max-w-sm rounded-3xl p-6">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
            <h2 className="text-lg font-bold text-fg">Lançar na pilinha</h2>
            <p className="mt-1 text-sm text-muted">
              Manda o gasto pra pilinha no WhatsApp — áudio, foto do comprovante ou só escrever. Ela organiza tudo aqui pra você.
            </p>
            {wpp ? (
              <a
                href={`https://wa.me/${wpp}`}
                target="_blank"
                rel="noreferrer"
                className="btn-accent mt-5 w-full"
                onClick={() => setSheet(false)}
              >
                <WhatsappIcon className="h-5 w-5" />
                Abrir conversa no WhatsApp
              </a>
            ) : null}
            <button className="btn-ghost mt-2 w-full" onClick={() => setSheet(false)}>
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BarItem({
  pathname,
  href,
  label,
  Icon,
}: {
  pathname: string;
  href: string;
  label: string;
  Icon: (p: { className?: string }) => React.JSX.Element;
}) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-label={label}
      className={`flex w-16 flex-col items-center gap-0.5 rounded-2xl px-0 py-1 text-[10px] font-medium transition ${
        active ? "text-accent" : "text-muted"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}
