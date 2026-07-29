import { describe, it, expect, vi, afterEach } from "vitest";
import { parseUpsert, sendText, markAsRead, sendPresence } from "../src/evolution";
import type { EvolutionConfig } from "../src/evolution";

const config: EvolutionConfig = {
  evolutionApiUrl: "https://evo.example",
  evolutionInstance: "inst",
  evolutionApiKey: "key",
};

afterEach(() => vi.restoreAllMocks());

describe("parseUpsert", () => {
  it("extrai texto de conversation", () => {
    const msg = parseUpsert({
      data: { key: { remoteJid: "5511999@s.whatsapp.net", fromMe: false, id: "M1" }, pushName: "Lucas", message: { conversation: "gastei 50 no almoco" } },
    });
    expect(msg).toMatchObject({ messageId: "M1", remoteJid: "5511999@s.whatsapp.net", fromNumber: "5511999", fromMe: false, kind: "texto", text: "gastei 50 no almoco" });
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

describe("markAsRead", () => {
  it("faz POST em markMessageAsRead com a key da mensagem", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await markAsRead(config, { remoteJid: "5511999@s.whatsapp.net", id: "M1", fromMe: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://evo.example/chat/markMessageAsRead/inst");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.readMessages[0]).toMatchObject({ remoteJid: "5511999@s.whatsapp.net", id: "M1", fromMe: false });
  });

  it("nao lanca quando o fetch falha", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
    await expect(markAsRead(config, { remoteJid: "x", id: "y", fromMe: false })).resolves.toBeUndefined();
  });
});

describe("sendPresence", () => {
  it("faz POST em sendPresence com composing e delay", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendPresence(config, "5511999", "composing", 3000);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://evo.example/chat/sendPresence/inst");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ number: "5511999", presence: "composing", delay: 3000 });
  });

  it("nao lanca quando o fetch falha", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("net"));
    await expect(sendPresence(config, "n", "composing")).resolves.toBeUndefined();
  });
});
