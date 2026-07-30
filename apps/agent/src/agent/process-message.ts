import type { Db } from "@ia/db";
import {
  getUserByWhatsappNumber,
  bootstrapUser,
  seedCategories,
  getSpaceForUser,
  markMessageProcessed,
} from "@ia/db";
import type { IncomingMessage } from "@ia/whatsapp";
import { pushSpaceBudgetAlerts } from "./space-alerts";

export type RunAgentArgs = {
  db: Db;
  userId: string;
  spaceId: string;
  threadId: string;
  incoming: IncomingMessage;
};

export type ProcessDeps = {
  db: Db;
  runAgent: (args: RunAgentArgs) => Promise<string>;
  sendText: (toNumber: string, text: string) => Promise<void>;
  markAsRead: (message: { remoteJid: string; id: string; fromMe: boolean }) => Promise<void>;
  setTyping: (toNumber: string) => Promise<void>;
};

const FALLBACK_TEXT = "Nao consegui processar sua mensagem agora. Pode tentar de novo?";

export async function processMessage(deps: ProcessDeps, incoming: IncomingMessage): Promise<void> {
  if (incoming.fromMe) return;
  const claimed = await markMessageProcessed(deps.db, incoming.messageId);
  if (!claimed) return;

  await deps
    .markAsRead({ remoteJid: incoming.remoteJid, id: incoming.messageId, fromMe: incoming.fromMe })
    .catch(() => {});

  if (incoming.kind === "unsupported") {
    await deps.sendText(incoming.fromNumber, "Por enquanto eu entendo texto, audio, foto, video e PDF. Pode mandar assim?");
    return;
  }

  try {
    let user = await getUserByWhatsappNumber(deps.db, incoming.fromNumber);
    let spaceId: string;
    const firstContact = !user;
    if (!user) {
      const created = await bootstrapUser(deps.db, { whatsappNumber: incoming.fromNumber, name: incoming.pushName });
      await seedCategories(deps.db, created.space.id);
      user = created.user;
      spaceId = created.space.id;
    } else {
      const space = await getSpaceForUser(deps.db, user.id);
      if (!space) {
        const created = await bootstrapUser(deps.db, { whatsappNumber: incoming.fromNumber, name: incoming.pushName });
        spaceId = created.space.id;
      } else {
        spaceId = space.id;
      }
    }

    await deps.setTyping(incoming.fromNumber).catch(() => {});

    const reply = await deps.runAgent({
      db: deps.db,
      userId: user.id,
      spaceId,
      threadId: incoming.fromNumber,
      incoming,
    });

    await deps.sendText(incoming.fromNumber, reply);

    await pushSpaceBudgetAlerts({
      db: deps.db,
      spaceId,
      authorUserId: user.id,
      sendText: deps.sendText,
    }).catch((e) => console.error(e));

    if (firstContact) {
      await deps.sendText(
        incoming.fromNumber,
        "Eai! 👋 Eu sou o *Pilinha*, teu parceiro pra cuidar da grana aqui no zap 💸\n\nSo me mandar teus gastos por texto, audio, foto ou PDF (ex: 'gastei 40 pila de gasolina hoje') que eu ja anoto. E quando quiser, me pergunta tipo 'quanto gastei em alimentacao esse mes?' que eu te falo. Bora?",
      );
    }
  } catch (err) {
    console.error(err);
    try {
      await deps.sendText(incoming.fromNumber, FALLBACK_TEXT);
    } catch (sendErr) {
      console.error(sendErr);
    }
  }
}
