import { describe, it, expect, vi, afterEach } from "vitest";
import { parseUpsert, sendText } from "../src/webhook/evolution";
import type { AppConfig } from "../src/config";

const config: AppConfig = {
  evolutionApiUrl: "https://evo.example",
  evolutionInstance: "inst",
  evolutionApiKey: "key",
  googleApiKey: "g",
  databaseUrl: "d",
  port: 3001,
};

afterEach(() => vi.restoreAllMocks());

describe("parseUpsert", () => {
  it("extrai texto de conversation", () => {
    const msg = parseUpsert({
      data: { key: { remoteJid: "5511999@s.whatsapp.net", fromMe: false, id: "M1" }, pushName: "Lucas", message: { conversation: "gastei 50 no almoco" } },
    });
    expect(msg).toMatchObject({ messageId: "M1", fromNumber: "5511999", fromMe: false, kind: "texto", text: "gastei 50 no almoco" });
  });

  it("marca audio como kind audio", () => {
    const msg = parseUpsert({
      data: { key: { remoteJid: "5511999@s.whatsapp.net", fromMe: false, id: "M2" }, message: { audioMessage: { mimetype: "audio/ogg" } } },
    });
    expect(msg?.kind).toBe("audio");
  });

  it("retorna null para payload sem data.key", () => {
    expect(parseUpsert({ foo: 1 })).toBeNull();
  });
});

describe("sendText", () => {
  it("faz POST no endpoint sendText com apikey e number", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
    await sendText(config, "5511999", "ok");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://evo.example/message/sendText/inst");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.apikey).toBe("key");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ number: "5511999", text: "ok" });
  });
});
