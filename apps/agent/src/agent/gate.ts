import type { AccessState } from "@ia/db";

export function blockedMessage(access: AccessState, billingUrl: string): string | null {
  if (access === "liberado") return null;
  if (access === "trial_expirado") {
    return `Opa! 👋 Teus dias de teste do *Pilinha* acabaram por aqui.\n\nPra continuar anotando teus gastos comigo, e so escolher um plano: ${billingUrl}`;
  }
  if (access === "inadimplente") {
    return `Eita, teu pagamento nao rolou e a assinatura ficou pendente 😕\n\nDa uma olhada aqui pra regularizar que eu volto na hora: ${billingUrl}`;
  }
  return `Tua assinatura do *Pilinha* esta cancelada.\n\nQuando quiser voltar, e so assinar de novo: ${billingUrl}`;
}
