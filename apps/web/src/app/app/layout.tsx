import type { ReactNode } from "react";
import Link from "next/link";
import { requireContext } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireContext();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b p-4">
        <span className="font-bold">Pilinha</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/app">Inicio</Link>
          <Link href="/app/transacoes">Transacoes</Link>
          <Link href="/app/espacos">Espacos</Link>
        </nav>
        <span className="text-sm text-gray-500">{ctx.userName ?? ""}</span>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
    </div>
  );
}
