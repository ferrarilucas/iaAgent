import type { Db } from "@ia/db";
import type { AppConfig } from "../config";
import { parseUpsert, fetchMediaBase64, sendText, markAsRead, sendPresence, type IncomingMessage } from "./evolution";
import { createTools } from "../agent/tools";
import { buildAgent } from "../agent/agent";
import { buildMemory } from "../agent/memory";
import { processMessage } from "../agent/process-message";

const MEDIA_MIME: Record<string, string> = {
  audio: "audio/ogg",
  foto: "image/jpeg",
  video: "video/mp4",
  pdf: "application/pdf",
};

export function createHandlerDeps(db: Db, config: AppConfig) {
  const memory = buildMemory(config);
  const runAgent = async (args: {
    db: Db;
    userId: string;
    spaceId: string;
    threadId: string;
    incoming: IncomingMessage;
  }): Promise<string> => {
    const tools = createTools(args.db, args.userId, args.spaceId);
    const agent = buildAgent(memory, tools);
    const content: any[] = [{ type: "text", text: args.incoming.text ?? "" }];
    if (args.incoming.kind !== "texto") {
      const base64 = await fetchMediaBase64(config, args.incoming.messageId);
      content.push({ type: "file", mediaType: MEDIA_MIME[args.incoming.kind], data: base64 });
    }
    const res = await agent.generate([{ role: "user", content }], {
      memory: { thread: args.threadId, resource: args.threadId },
    });
    return res.text;
  };
  return {
    db,
    runAgent,
    sendText: (toNumber: string, text: string) => sendText(config, toNumber, text),
    markAsRead: (message: { remoteJid: string; id: string; fromMe: boolean }) => markAsRead(config, message),
    setTyping: (toNumber: string) => sendPresence(config, toNumber, "composing", 3000),
  };
}

export function handleUpsert(deps: ReturnType<typeof createHandlerDeps>, payload: unknown): void {
  const incoming = parseUpsert(payload);
  if (!incoming) return;
  void processMessage(deps, incoming).catch((err) => {
    console.error("erro ao processar mensagem", incoming.messageId, err);
  });
}
