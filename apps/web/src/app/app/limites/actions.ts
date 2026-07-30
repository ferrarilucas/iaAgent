"use server";
import { revalidatePath } from "next/cache";
import { createBudget, updateBudget, deleteBudget, listBudgetsForUser, listBudgetsForSpace } from "@ia/db";
import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { parseAmountBR } from "@/lib/format";

async function pertence(ctx: { userId: string; spaceId: string }, id: string): Promise<boolean> {
  const [pessoais, doEspaco] = await Promise.all([listBudgetsForUser(db, ctx.userId), listBudgetsForSpace(db, ctx.spaceId)]);
  return [...pessoais, ...doEspaco].some((b) => b.id === id);
}

export async function criarLimite(formData: FormData) {
  const ctx = await requireContext();
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = parseAmountBR(String(formData.get("amount") ?? ""));
  const scope = formData.get("scope") === "space" ? "space" : "user";
  if (!categoryId || !amount) return;
  await createBudget(db, {
    categoryId,
    amount,
    scope,
    userId: scope === "user" ? ctx.userId : undefined,
    spaceId: scope === "space" ? ctx.spaceId : undefined,
  });
  revalidatePath("/app/limites");
}

export async function atualizarLimite(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") ?? "");
  const amount = parseAmountBR(String(formData.get("amount") ?? ""));
  if (!id || !amount) return;
  if (!(await pertence(ctx, id))) return;
  await updateBudget(db, id, { amount });
  revalidatePath("/app/limites");
}

export async function apagarLimite(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  if (!(await pertence(ctx, id))) return;
  await deleteBudget(db, id);
  revalidatePath("/app/limites");
}
