"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Avatar } from "./ui";

export function UserMenu({ name }: { name?: string | null }) {
  const router = useRouter();

  async function sair() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 sm:flex">
        <Avatar name={name} />
        <span className="max-w-[9rem] truncate text-sm font-medium text-navy-700">{name ?? "Você"}</span>
      </div>
      <button onClick={sair} className="btn-ghost px-3 py-1.5 text-xs">
        Sair
      </button>
    </div>
  );
}
