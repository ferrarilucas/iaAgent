import type { Db } from "@ia/db";
import {
  getUserByWhatsappNumber,
  bootstrapUser,
  seedCategories,
  getSpaceForUser,
  isMessageProcessed,
  markMessageProcessed,
} from "@ia/db";
import type { IncomingMessage } from "../webhook/evolution";

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
};

export async function processMessage(deps: ProcessDeps, incoming: IncomingMessage): Promise<void> {
  if (incoming.fromMe) return;
  if (await isMessageProcessed(deps.db, incoming.messageId)) return;
  await markMessageProcessed(deps.db, incoming.messageId);

  if (incoming.kind === "unsupported") {
    await deps.sendText(incoming.fromNumber, "Por enquanto eu entendo texto, audio, foto, video e PDF. Pode mandar assim?");
    return;
  }

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

  const reply = await deps.runAgent({
    db: deps.db,
    userId: user.id,
    spaceId,
    threadId: incoming.fromNumber,
    incoming,
  });

  await deps.sendText(incoming.fromNumber, reply);

  if (firstContact) {
    await deps.sendText(
      incoming.fromNumber,
      "Oi! Sou seu assistente financeiro. Me manda seus gastos por texto, audio, foto ou PDF (ex: 'gastei 50 no almoco') que eu registro. Pergunte tambem 'quanto gastei em alimentacao esse mes?'.",
    );
  }
}
