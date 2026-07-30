import type { ReactNode } from "react";
import Link from "next/link";
import { requireContext } from "@/lib/session";
import { PilinhaLogo } from "@/components/logo";
import { FloatingNav } from "@/components/floating-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireContext();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 md:hidden">
        <Link href="/app" aria-label="pilinha">
          <PilinhaLogo />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Avatar name={ctx.userName} />
        </div>
      </header>

      <FloatingNav />

      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-2 md:pb-12 md:pl-24 md:pr-6 md:pt-10">
        {children}
      </main>
    </div>
  );
}
