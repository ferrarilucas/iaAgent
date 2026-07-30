import type { Db } from "@ia/db";
import { getBudgetAlerts, getSpaceMembersWithNumber, claimBudgetAlertNotification } from "@ia/db";

function brl(v: string): string {
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function pushSpaceBudgetAlerts(input: {
  db: Db;
  spaceId: string;
  authorUserId: string;
  sendText: (toNumber: string, text: string) => Promise<void>;
}): Promise<void> {
  const alertas = await getBudgetAlerts(input.db, { userId: input.authorUserId, spaceId: input.spaceId });
  const doEspaco = alertas.filter((a) => a.escopo === "espaco" && a.status !== "ok");
  if (doEspaco.length === 0) return;

  const membros = (await getSpaceMembersWithNumber(input.db, input.spaceId)).filter(
    (m) => m.userId !== input.authorUserId,
  );
  if (membros.length === 0) return;

  for (const a of doEspaco) {
    const verbo = a.status === "estourado" ? "passou do limite" : "esta chegando no limite";
    const texto = `⚠️ Alerta do espaco na pilinha: a categoria *${a.categoria}* ${verbo} — ${brl(a.gasto)} de ${brl(a.teto)} (${a.percentual}%) neste ciclo. Fica de olho! 👀`;
    for (const m of membros) {
      const liberado = await claimBudgetAlertNotification(input.db, {
        userId: m.userId,
        categoryId: a.categoryId,
        scope: "espaco",
      });
      if (!liberado) continue;
      await input.sendText(m.whatsappNumber, texto).catch(() => {});
    }
  }
}
