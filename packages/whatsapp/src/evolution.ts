export type EvolutionConfig = {
  evolutionApiUrl: string;
  evolutionInstance: string;
  evolutionApiKey: string;
};

type IncomingMessage = {
  messageId: string;
  remoteJid: string;
  fromMe: boolean;
  text: string;
  buttonId?: string;
};

export function parseUpsert(payload: unknown): IncomingMessage | null {
  const data = (payload as {
    data?: {
      key?: { id?: unknown; remoteJid?: unknown; fromMe?: unknown };
      message?: {
        conversation?: unknown;
        extendedTextMessage?: { text?: unknown };
        buttonsResponseMessage?: { selectedButtonId?: unknown };
        templateButtonReplyMessage?: { selectedId?: unknown };
        interactiveResponseMessage?: { nativeFlowResponseMessage?: { paramsJson?: unknown } };
      };
    };
  } | null)?.data;
  const key = data?.key;
  if (typeof key?.id !== "string" || typeof key.remoteJid !== "string") return null;

  const text = data?.message?.conversation ?? data?.message?.extendedTextMessage?.text;
  const message = data?.message;
  let buttonId = message?.buttonsResponseMessage?.selectedButtonId ?? message?.templateButtonReplyMessage?.selectedId;
  const params = message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (typeof params === "string") {
    try {
      buttonId ??= JSON.parse(params)?.id;
    } catch {
      // Invalid interactive replies are ignored.
    }
  }
  if (typeof text !== "string" && typeof buttonId !== "string") return null;
  return {
    messageId: key.id,
    remoteJid: key.remoteJid,
    fromMe: Boolean(key.fromMe),
    text: typeof text === "string" ? text : "",
    ...(typeof buttonId === "string" ? { buttonId } : {}),
  };
}

export async function sendText(config: EvolutionConfig, toNumber: string, text: string): Promise<void> {
  const res = await fetch(`${config.evolutionApiUrl}/message/sendText/${config.evolutionInstance}`, {
    method: "POST",
    headers: { apikey: config.evolutionApiKey, "content-type": "application/json" },
    body: JSON.stringify({ number: toNumber, text }),
  });
  if (!res.ok) throw new Error(`evolution sendText ${res.status}`);
}

export async function sendButtons(
  config: EvolutionConfig,
  number: string,
  buttons: { id: string; displayText: string }[],
): Promise<void> {
  const response = await fetch(`${config.evolutionApiUrl}/message/sendButtons/${config.evolutionInstance}`, {
    method: "POST",
    headers: { apikey: config.evolutionApiKey, "content-type": "application/json" },
    body: JSON.stringify({
      number,
      title: "Escolha seu espaço",
      description: "Toque no espaço que você quer consultar.",
      footer: "Cipri",
      buttons: buttons.map((button) => ({ type: "reply", ...button })),
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Evolution sendButtons HTTP ${response.status}`);
}
