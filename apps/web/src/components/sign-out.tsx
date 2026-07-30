"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { LogoutIcon } from "./icons";

export function SignOut({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const router = useRouter();

  async function sair() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  if (variant === "full") {
    return (
      <button
        onClick={sair}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-surface2 hover:text-fg"
      >
        <LogoutIcon className="h-5 w-5" />
        Sair
      </button>
    );
  }

  return (
    <button
      onClick={sair}
      aria-label="Sair"
      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-muted transition hover:bg-surface2 hover:text-fg"
    >
      <LogoutIcon className="h-5 w-5" />
    </button>
  );
}
