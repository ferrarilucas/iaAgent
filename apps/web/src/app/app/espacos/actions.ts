"use server";
import { revalidatePath } from "next/cache";
import { createInvitation, acceptInvitation } from "@ia/db";
import { sendText, normalizeBrazilNumber } from "@ia/whatsapp";
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
  const bruto = String(formData.get("numero") ?? "").trim();
  if (!bruto) return;
  const numero = normalizeBrazilNumber(bruto);
  await createInvitation(db, { spaceId: ctx.spaceId, invitedBy: ctx.userId, invitedNumber: numero });
  const link = `${env.BETTER_AUTH_URL}/app/espacos`;
  await sendText(
    evolution,
    numero,
    `Voce foi convidado pra compartilhar as contas na pilinha 💛\nEntre com o seu numero e aceite aqui: ${link}`,
  ).catch(() => {});
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
