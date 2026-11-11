export type EvolutionConfig = {
  evolutionApiUrl: string;
  evolutionInstance: string;
  evolutionApiKey: string;
};

type TextMessage = {
  messageId: string;
  remoteJid: string;
  fromMe: boolean;
  text: string;
};

export function parseUpsert(payload: unknown): TextMessage | null {
  const data = (payload as {
    data?: {
      key?: { id?: unknown; remoteJid?: unknown; fromMe?: unknown };
      message?: { conversation?: unknown; extendedTextMessage?: { text?: unknown } };
    };
  } | null)?.data;
  const key = data?.key;
  if (typeof key?.id !== "string" || typeof key.remoteJid !== "string") return null;

  const text = data?.message?.conversation ?? data?.message?.extendedTextMessage?.text;
  if (typeof text !== "string") return null;
  return { messageId: key.id, remoteJid: key.remoteJid, fromMe: Boolean(key.fromMe), text };
}

export async function sendText(config: EvolutionConfig, toNumber: string, text: string): Promise<void> {
  const res = await fetch(`${config.evolutionApiUrl}/message/sendText/${config.evolutionInstance}`, {
    method: "POST",
    headers: { apikey: config.evolutionApiKey, "content-type": "application/json" },
    body: JSON.stringify({ number: toNumber, text }),
  });
  if (!res.ok) throw new Error(`evolution sendText ${res.status}`);
}
