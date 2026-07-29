import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function AppHome() {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">Ola, {session?.user.name ?? "por aqui"} 👋</h1>
      <p className="mt-2 text-gray-600">Em breve: espacos, transacoes, dashboard e limites.</p>
    </main>
  );
}
