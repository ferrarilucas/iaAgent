"use server";
import { revalidatePath } from "next/cache";
import { createInvitation, acceptInvitation } from "@ia/db";
import { sendText } from "@ia/whatsapp";
import { requireContext } from "@/lib/session";
import { db } from "@/lib/db";
import { env } from "@/env";

const evolution = {
  evolutionApiUrl: env.EVOLUTION_API_URL,
  evolutionInstance: env.EVOLUTION_INSTANCE,
  evolutionApiKey: env.EVOLUTION_API_KEY,
};

export async function convidar(formData: FormData) {
  const ctx = await requireContext();
  const numero = String(formData.get("numero") ?? "").trim();
  if (!numero) return;
  await createInvitation(db, { spaceId: ctx.spaceId, invitedBy: ctx.userId, invitedNumber: numero });
  await sendText(evolution, numero, "Voce foi convidado para compartilhar as contas no Pilinha. Abra o painel para aceitar.").catch(() => {});
  revalidatePath("/app/espacos");
}

export async function aceitar(formData: FormData) {
  const ctx = await requireContext();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  if (!ctx.phoneNumber) return;
  await acceptInvitation(db, id, ctx.userId, ctx.phoneNumber);
  revalidatePath("/app/espacos");
}
