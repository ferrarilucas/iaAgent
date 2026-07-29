"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/app", label: "Início" },
  { href: "/app/transacoes", label: "Transações" },
  { href: "/app/espacos", label: "Espaços" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {links.map((l) => {
        const active = l.href === "/app" ? pathname === "/app" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-navy-700 text-white shadow-soft" : "text-ink-muted hover:bg-cream-200/70 hover:text-navy-700"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
