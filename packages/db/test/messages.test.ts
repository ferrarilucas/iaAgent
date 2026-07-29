import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { isMessageProcessed, markMessageProcessed } from "../src/repository/messages";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("processed messages", () => {
  it("marca e detecta idempotencia", async () => {
    const t = await createTestDb(); close = t.close;
    expect(await isMessageProcessed(t.db, "ABC")).toBe(false);
    await markMessageProcessed(t.db, "ABC");
    expect(await isMessageProcessed(t.db, "ABC")).toBe(true);
  });

  it("markMessageProcessed e idempotente (nao lanca em duplicata)", async () => {
    const t = await createTestDb(); close = t.close;
    await markMessageProcessed(t.db, "X");
    await markMessageProcessed(t.db, "X");
    expect(await isMessageProcessed(t.db, "X")).toBe(true);
  });
});
