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

function parseRefDay(raw: string): number | null {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n > 28) return null;
  return n;
}

export async function criarLimite(formData: FormData) {
  const ctx = await requireContext();
  const categoryId = String(formData.get("categoryId") ?? "");
  const amount = parseAmountBR(String(formData.get("amount") ?? ""));
  const scope = formData.get("scope") === "space" ? "space" : "user";
  const referenceDay = parseRefDay(String(formData.get("referenceDay") ?? "1")) ?? 1;
  if (!categoryId || !amount) return;
  await createBudget(db, {
    categoryId,
    amount,
    scope,
    referenceDay,
    userId: scope === "user" ? ctx.userId : undefined,
    spaceId: scope === "space" ? ctx.spaceId : undefined,
  });
  revalidatePath("/app/limites");
}

export async function atualizarLimite(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const amount = parseAmountBR(String(formData.get("amount") ?? ""));
  const referenceDay = parseRefDay(String(formData.get("referenceDay") ?? ""));
  if (amount === null && referenceDay === null) return;
  if (!(await pertence(ctx, id))) return;
  await updateBudget(db, id, {
    ...(amount !== null ? { amount } : {}),
    ...(referenceDay !== null ? { referenceDay } : {}),
  });
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
