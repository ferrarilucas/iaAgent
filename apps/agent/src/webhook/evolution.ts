import type { AppConfig } from "../config";

export type IncomingMessage = {
  messageId: string;
  fromNumber: string;
  fromMe: boolean;
  pushName?: string;
  kind: "texto" | "audio" | "foto" | "video" | "pdf" | "unsupported";
  text?: string;
  media?: { mediaType: string; base64: string };
};

function numberFromJid(jid: string): string {
  return jid.split("@")[0].split(":")[0];
}

export function parseUpsert(payload: unknown): IncomingMessage | null {
  const data = (payload as { data?: any })?.data;
  const key = data?.key;
  if (!data || !key || typeof key.id !== "string" || typeof key.remoteJid !== "string") return null;
  const base = {
    messageId: key.id as string,
    fromNumber: numberFromJid(key.remoteJid),
    fromMe: Boolean(key.fromMe),
    pushName: typeof data.pushName === "string" ? data.pushName : undefined,
  };
  const message = data.message ?? {};
  if (typeof message.conversation === "string") {
    return { ...base, kind: "texto", text: message.conversation };
  }
  if (typeof message.extendedTextMessage?.text === "string") {
    return { ...base, kind: "texto", text: message.extendedTextMessage.text };
  }
  if (message.audioMessage) return { ...base, kind: "audio" };
  if (message.imageMessage) return { ...base, kind: "foto", text: message.imageMessage.caption };
  if (message.videoMessage) return { ...base, kind: "video", text: message.videoMessage.caption };
  if (message.documentMessage) return { ...base, kind: "pdf", text: message.documentMessage.caption };
  return { ...base, kind: "unsupported" };
}

export async function fetchMediaBase64(config: AppConfig, messageId: string): Promise<string> {
  const res = await fetch(
    `${config.evolutionApiUrl}/chat/getBase64FromMediaMessage/${config.evolutionInstance}`,
    {
      method: "POST",
      headers: { apikey: config.evolutionApiKey, "content-type": "application/json" },
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
    },
  );
  if (!res.ok) throw new Error(`evolution getBase64 ${res.status}`);
  const json = (await res.json()) as { base64?: string };
  if (!json.base64) throw new Error("evolution getBase64 sem base64");
  return json.base64;
}

export async function sendText(config: AppConfig, toNumber: string, text: string): Promise<void> {
  const res = await fetch(`${config.evolutionApiUrl}/message/sendText/${config.evolutionInstance}`, {
    method: "POST",
    headers: { apikey: config.evolutionApiKey, "content-type": "application/json" },
    body: JSON.stringify({ number: toNumber, text }),
  });
  if (!res.ok) throw new Error(`evolution sendText ${res.status}`);
}
