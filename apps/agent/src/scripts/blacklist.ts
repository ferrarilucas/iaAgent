import type { Db } from "@ia/db";
import { blockNumber, unblockNumber, listBlockedNumbers } from "@ia/db";
import { normalizeBrazilNumber } from "@ia/whatsapp";

export const USO =
  "uso: blacklist add <numero> [motivo] | blacklist remove <numero> | blacklist list";

export async function runBlacklistCommand(db: Db, argv: string[]): Promise<string> {
  const [comando, alvo, ...resto] = argv;

  if (comando === "add") {
    if (!alvo) throw new Error(`informe o numero. ${USO}`);
    const numero = normalizeBrazilNumber(alvo);
    const motivo = resto.join(" ").trim() || undefined;
    await blockNumber(db, numero, motivo);
    return `bloqueado: ${numero}${motivo ? ` (${motivo})` : ""}`;
  }

  if (comando === "remove") {
    if (!alvo) throw new Error(`informe o numero. ${USO}`);
    const numero = normalizeBrazilNumber(alvo);
    const removido = await unblockNumber(db, numero);
    return removido ? `desbloqueado: ${numero}` : `${numero} nao estava na lista negra`;
  }

  if (comando === "list") {
    const rows = await listBlockedNumbers(db);
    if (rows.length === 0) return "lista negra vazia";
    return rows
      .map((r) => `${r.whatsappNumber}\t${r.reason ?? "-"}\t${r.blockedAt.toISOString()}`)
      .join("\n");
  }

  throw new Error(USO);
}
