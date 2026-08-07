import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestDb } from "../../../packages/db/test/helpers";
import { bootstrapUser, ensureTrialSubscription, TRIAL_DAYS } from "@ia/db";
import { subscriptions } from "../../../packages/db/src/schema";
import { eq } from "drizzle-orm";
import { blockedMessage } from "../src/agent/gate";
import { processMessage } from "../src/agent/process-message";
import type { IncomingMessage } from "@ia/whatsapp";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  if (close) await close();
  vi.restoreAllMocks();
});

const BILLING = "https://pilinha.com.br/precos";

const msg = (id: string, numero: string): IncomingMessage => ({
  messageId: id,
  remoteJid: `${numero}@s.whatsapp.net`,
  fromNumber: numero,
  fromMe: false,
  pushName: "Lucas",
  kind: "texto",
  text: "gastei 50 no almoco",
});

describe("blockedMessage", () => {
  it("nao bloqueia quem esta liberado", () => {
    expect(blockedMessage("liberado", BILLING)).toBeNull();
  });

  it("explica o fim do trial com o link", () => {
    const texto = blockedMessage("trial_expirado", BILLING)!;
    expect(texto).toContain(BILLING);
    expect(texto.toLowerCase()).toContain("teste");
  });

  it("explica a inadimplencia com o link", () => {
    const texto = blockedMessage("inadimplente", BILLING)!;
    expect(texto).toContain(BILLING);
    expect(texto.toLowerCase()).toContain("pagamento");
  });

  it("explica o cancelamento com o link", () => {
    const texto = blockedMessage("cancelado", BILLING)!;
    expect(texto).toContain(BILLING);
    expect(texto.toLowerCase()).toContain("cancelada");
  });
});

describe("porteiro no processMessage", () => {
  const deps = (db: any, sent: string[], runAgent: any) => ({
    db,
    runAgent,
    sendText: vi.fn(async (_n: string, text: string) => {
      sent.push(text);
    }),
    markAsRead: vi.fn(async () => {}),
    setTyping: vi.fn(async () => {}),
    subscriptionsEnabled: true,
    billingUrl: BILLING,
  });

  it("cria o trial no primeiro contato e deixa passar", async () => {
    const t = await createTestDb();
    close = t.close;
    const sent: string[] = [];
    const runAgent = vi.fn(async () => "beleza");

    await processMessage(deps(t.db, sent, runAgent) as any, msg("G1", "5551920000001"));

    expect(runAgent).toHaveBeenCalledTimes(1);
    const rows = await t.db.select().from(subscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("trial");
  });

  it("bloqueia sem chamar a IA quando o trial venceu", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551920000002", name: "L" });
    const passado = new Date(Date.now() - (TRIAL_DAYS + 2) * 86400000);
    await ensureTrialSubscription(t.db, user.id, passado);

    const sent: string[] = [];
    const runAgent = vi.fn(async () => "nao deveria rodar");

    await processMessage(deps(t.db, sent, runAgent) as any, msg("G2", "5551920000002"));

    expect(runAgent).not.toHaveBeenCalled();
    expect(sent.some((t) => t.includes(BILLING))).toBe(true);
  });

  it("bloqueia quem cancelou", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user } = await bootstrapUser(t.db, { whatsappNumber: "5551920000003", name: "L" });
    await ensureTrialSubscription(t.db, user.id);
    await t.db.update(subscriptions).set({ status: "cancelado" }).where(eq(subscriptions.userId, user.id));

    const sent: string[] = [];
    const runAgent = vi.fn(async () => "nao deveria rodar");

    await processMessage(deps(t.db, sent, runAgent) as any, msg("G3", "5551920000003"));

    expect(runAgent).not.toHaveBeenCalled();
  });

  it("com a flag desligada nao cria assinatura nem bloqueia", async () => {
    const t = await createTestDb();
    close = t.close;
    const sent: string[] = [];
    const runAgent = vi.fn(async () => "beleza");
    const d = deps(t.db, sent, runAgent) as any;
    d.subscriptionsEnabled = false;

    await processMessage(d, msg("G4", "5551920000004"));

    expect(runAgent).toHaveBeenCalledTimes(1);
    const rows = await t.db.select().from(subscriptions);
    expect(rows).toHaveLength(0);
  });
});
