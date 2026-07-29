import type { ReactNode } from "react";
import Link from "next/link";
import { requireContext } from "@/lib/session";
import { PilinhaLogo } from "@/components/logo";
import { Nav } from "@/components/nav";
import { UserMenu } from "@/components/user-menu";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireContext();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-cream-200 bg-cream-100/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/app" className="shrink-0">
            <PilinhaLogo />
          </Link>
          <div className="hidden md:block">
            <Nav />
          </div>
          <UserMenu name={ctx.userName} />
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-3 md:hidden">
          <Nav />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
