import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestDb } from "../../../packages/db/test/helpers";
import { getUserByWhatsappNumber, listTransactionsForSpace, getSpaceForUser } from "@ia/db";
import { processMessage } from "../src/agent/process-message";
import type { IncomingMessage } from "../src/webhook/evolution";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); vi.restoreAllMocks(); });

describe("processMessage", () => {
  it("faz bootstrap no primeiro contato e registra via agent", async () => {
    const t = await createTestDb(); close = t.close;
    const sent: string[] = [];
    const runAgent = vi.fn(async ({ db, userId, spaceId }: any) => {
      const { registrarTransacaoImpl } = await import("../src/agent/tools");
      await registrarTransacaoImpl(db, { userId, spaceId, itens: [{ type: "despesa", amount: "50.00", categoria: "alimentacao", occurredAt: "2026-07-05", source: "texto" }] });
      return "Registrado: R$50 alimentacao";
    });
    const sendText = vi.fn(async (_n: string, text: string) => { sent.push(text); });

    const incoming: IncomingMessage = { messageId: "M1", fromNumber: "5511", fromMe: false, pushName: "Lucas", kind: "texto", text: "gastei 50 no almoco" };
    await processMessage({ db: t.db, runAgent, sendText }, incoming);

    const user = await getUserByWhatsappNumber(t.db, "5511");
    expect(user).toBeDefined();
    const space = await getSpaceForUser(t.db, user!.id);
    const txs = await listTransactionsForSpace(t.db, space!.id);
    expect(txs).toHaveLength(1);
    expect(sent[0]).toContain("Registrado");
  });

  it("ignora mensagem duplicada (idempotencia)", async () => {
    const t = await createTestDb(); close = t.close;
    const runAgent = vi.fn(async () => "ok");
    const sendText = vi.fn(async () => {});
    const incoming: IncomingMessage = { messageId: "DUP", fromNumber: "5511", fromMe: false, kind: "texto", text: "oi" };
    await processMessage({ db: t.db, runAgent, sendText }, incoming);
    await processMessage({ db: t.db, runAgent, sendText }, incoming);
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it("envia fallback e nao rejeita quando runAgent falha", async () => {
    const t = await createTestDb(); close = t.close;
    const runAgent = vi.fn(async () => { throw new Error("gemini indisponivel"); });
    const sent: string[] = [];
    const sendText = vi.fn(async (_n: string, text: string) => { sent.push(text); });
    const incoming: IncomingMessage = { messageId: "FAIL1", fromNumber: "5511", fromMe: false, kind: "texto", text: "gastei 50 no almoco" };

    await expect(processMessage({ db: t.db, runAgent, sendText }, incoming)).resolves.toBeUndefined();

    expect(sent.some((text) => text.includes("tentar de novo"))).toBe(true);
  });
});
