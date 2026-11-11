import { afterEach, describe, expect, it, vi } from "vitest";
import { createCipriWebhook } from "../src/cipri/bot";

const bot = createCipriWebhook({
  CIPRI_URL: "https://cipri.example",
  CIPRI_BOT_SECRET: "s".repeat(32),
  CIPRI_WEBHOOK_SECRET: "w".repeat(32),
  NINEROUTER_URL: "https://router.example/v1/",
  NINEROUTER_MODEL: "cipri",
  EVOLUTION_API_URL: "https://evolution.example",
  EVOLUTION_INSTANCE: "cipri",
  EVOLUTION_API_KEY: "evolution",
});

function payload(text: string, jid = "555199892403@s.whatsapp.net") {
  return {
    event: "messages.upsert",
    instance: "cipri",
    data: { key: { id: "m1", remoteJid: jid }, message: { conversation: text } },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("WhatsApp do Cipri", () => {
  it("ignora grupos e mensagens sem uma identidade de telefone válida", async () => {
    const request = vi.spyOn(globalThis, "fetch");
    await bot.process(payload("Oi", "555199892403@g.us"));
    await bot.process(payload("Oi", "555199892403@lid"));
    expect(request).not.toHaveBeenCalled();
  });

  it("normaliza a variante sem 9 e responde ao bloqueio sem consultar o 9Router", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ status: "done", text: "Vincule seu telefone." }))
      .mockResolvedValueOnce(Response.json({}));
    await bot.process(payload("Me passa um resumo do que falta cair?"));
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      action: "access", phone: "5551999892403", messageId: "m1",
    });
    expect(request.mock.calls[1][0]).toBe("https://evolution.example/message/sendText/cipri");
  });

  it("encerra silenciosamente quando o aviso do dia já foi reservado", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ status: "done" }));
    await bot.process(payload("Oi", "5551999892403@s.whatsapp.net"));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("consulta o 9Router após o acesso e só envia a intenção validada ao Cipri", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ status: "allowed" }))
      .mockResolvedValueOnce(Response.json({
        choices: [{ message: { content: '{"action":"customer_balance","name":"Jéssica"}' } }],
      }))
      .mockResolvedValueOnce(Response.json({ status: "done", text: "1. Jéssica Silva\n2. Jéssica Santos" }))
      .mockResolvedValueOnce(Response.json({}));
    await bot.process(payload("Me diz o saldo pendente da Jéssica"));
    expect(request).toHaveBeenCalledTimes(4);
    expect(request.mock.calls[1][0]).toBe("https://router.example/v1/chat/completions");
    expect(JSON.parse(String(request.mock.calls[2][1]?.body))).toEqual({
      action: "customer_balance", name: "Jéssica", phone: "5551999892403",
    });
  });

  it("confirma a opção diretamente sem usar o modelo", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ status: "allowed" }))
      .mockResolvedValueOnce(Response.json({ status: "done", text: "R$ 20,00 em aberto" }))
      .mockResolvedValueOnce(Response.json({}));
    await bot.process(payload("2"));
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
      action: "confirm", option: 2, phone: "5551999892403",
    });
  });
});
