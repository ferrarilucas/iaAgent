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

  it("usa o telefone alternativo quando o Evolution envia o remetente como LID", async () => {
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ status: "done", text: "Vincule seu telefone." }))
      .mockResolvedValueOnce(Response.json({}));
    const event = payload("Oi", "1234567890@lid");
    await bot.process({
      ...event,
      data: {
        ...event.data,
        key: { ...event.data.key, remoteJidAlt: "5551999892403@s.whatsapp.net" },
      },
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ phone: "5551999892403" });
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toMatchObject({ number: "5551999892403" });
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

  it("abre o menu sem IA e oferece texto mesmo se o Evolution recusar os botões", async () => {
    const menuId = "68d4961f-f1a0-45e5-8ef6-c7bdd99a7397";
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ status: "done", workspaceMenu: { id: menuId, names: ["Loja A", "Loja B"] } }))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    await bot.process(payload("Quero trocar de workspace"));
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ action: "access", switchWorkspace: true });
    expect(JSON.parse(String(request.mock.calls[1][1]?.body)).text).toContain("workspace 1");
    expect(request.mock.calls[2][0]).toContain("/message/sendButtons/");
    expect(JSON.parse(String(request.mock.calls[2][1]?.body)).buttons[1].id).toBe(`cipri-space:${menuId}:2`);
  });

  it("processa o clique nativo sem encaminhar o ID ao 9Router", async () => {
    const menuId = "68d4961f-f1a0-45e5-8ef6-c7bdd99a7397";
    const request = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ status: "done", text: "Loja B selecionada." }))
      .mockResolvedValueOnce(Response.json({}));
    const event = payload("");
    await bot.process({
      ...event,
      data: {
        ...event.data,
        message: { interactiveResponseMessage: { nativeFlowResponseMessage: {
          paramsJson: JSON.stringify({ id: `cipri-space:${menuId}:2` }),
        } } },
      },
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ action: "select_workspace", menuId, option: 2 });
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
