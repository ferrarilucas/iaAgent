import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { isMessageProcessed, markMessageProcessed } from "../src/repository/messages";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("processed messages", () => {
  it("marca e detecta idempotencia", async () => {
    const t = await createTestDb(); close = t.close;
    expect(await isMessageProcessed(t.db, "ABC")).toBe(false);
    expect(await markMessageProcessed(t.db, "ABC")).toBe(true);
    expect(await isMessageProcessed(t.db, "ABC")).toBe(true);
  });

  it("markMessageProcessed reivindica atomicamente (segunda chamada retorna false)", async () => {
    const t = await createTestDb(); close = t.close;
    expect(await markMessageProcessed(t.db, "X")).toBe(true);
    expect(await markMessageProcessed(t.db, "X")).toBe(false);
    expect(await isMessageProcessed(t.db, "X")).toBe(true);
  });
});
