import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import {
  isNumberBlocked,
  blockNumber,
  unblockNumber,
  listBlockedNumbers,
} from "../src/repository/blocked-numbers";
import { blockedNumbers } from "../src/schema";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("lista negra", () => {
  it("numero fora da lista nao esta bloqueado", async () => {
    const t = await createTestDb(); close = t.close;
    expect(await isNumberBlocked(t.db, "5551999998888")).toBe(false);
  });

  it("bloqueia um numero e passa a detecta-lo", async () => {
    const t = await createTestDb(); close = t.close;
    await blockNumber(t.db, "5551999998888", "spam");
    expect(await isNumberBlocked(t.db, "5551999998888")).toBe(true);
  });

  it("bloquear o mesmo numero de novo atualiza o motivo sem quebrar", async () => {
    const t = await createTestDb(); close = t.close;
    await blockNumber(t.db, "5551999998888", "spam");
    await blockNumber(t.db, "5551999998888", "abuso");
    const rows = await listBlockedNumbers(t.db);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("abuso");
  });

  it("desbloqueia e informa se havia algo para desbloquear", async () => {
    const t = await createTestDb(); close = t.close;
    await blockNumber(t.db, "5551999998888", "spam");
    expect(await unblockNumber(t.db, "5551999998888")).toBe(true);
    expect(await isNumberBlocked(t.db, "5551999998888")).toBe(false);
    expect(await unblockNumber(t.db, "5551999998888")).toBe(false);
  });

  it("lista os bloqueados do mais recente para o mais antigo", async () => {
    const t = await createTestDb(); close = t.close;
    await t.db.insert(blockedNumbers).values([
      { whatsappNumber: "5551111111111", reason: "antigo", blockedAt: new Date("2026-01-01T00:00:00Z") },
      { whatsappNumber: "5552222222222", reason: "recente", blockedAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    const rows = await listBlockedNumbers(t.db);
    expect(rows.map((r) => r.whatsappNumber)).toEqual(["5552222222222", "5551111111111"]);
  });

  it("desempata pelo numero quando os bloqueios sao do mesmo instante", async () => {
    const t = await createTestDb(); close = t.close;
    const mesmoInstante = new Date("2026-08-01T00:00:00Z");
    await t.db.insert(blockedNumbers).values([
      { whatsappNumber: "5559999999999", reason: "a", blockedAt: mesmoInstante },
      { whatsappNumber: "5551111111111", reason: "b", blockedAt: mesmoInstante },
    ]);
    const rows = await listBlockedNumbers(t.db);
    expect(rows.map((r) => r.whatsappNumber)).toEqual(["5551111111111", "5559999999999"]);
  });
});
