import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "../../../packages/db/test/helpers";
import { isNumberBlocked, blockNumber } from "@ia/db";
import { runBlacklistCommand } from "../src/scripts/blacklist";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("cli da lista negra", () => {
  it("add normaliza o numero antes de bloquear", async () => {
    const t = await createTestDb(); close = t.close;
    await runBlacklistCommand(t.db, ["add", "(51) 99999-8888", "spam"]);
    expect(await isNumberBlocked(t.db, "5551999998888")).toBe(true);
  });

  it("remove normaliza o numero antes de desbloquear", async () => {
    const t = await createTestDb(); close = t.close;
    await blockNumber(t.db, "5551999998888", "spam");
    await runBlacklistCommand(t.db, ["remove", "51999998888"]);
    expect(await isNumberBlocked(t.db, "5551999998888")).toBe(false);
  });

  it("remove avisa quando o numero nao estava na lista", async () => {
    const t = await createTestDb(); close = t.close;
    const saida = await runBlacklistCommand(t.db, ["remove", "5551999998888"]);
    expect(saida).toContain("nao estava");
  });

  it("list mostra os numeros bloqueados com motivo", async () => {
    const t = await createTestDb(); close = t.close;
    await blockNumber(t.db, "5551999998888", "spam");
    const saida = await runBlacklistCommand(t.db, ["list"]);
    expect(saida).toContain("5551999998888");
    expect(saida).toContain("spam");
  });

  it("list avisa quando a lista esta vazia", async () => {
    const t = await createTestDb(); close = t.close;
    const saida = await runBlacklistCommand(t.db, ["list"]);
    expect(saida).toContain("vazia");
  });

  it("add sem numero recusa o comando", async () => {
    const t = await createTestDb(); close = t.close;
    await expect(runBlacklistCommand(t.db, ["add"])).rejects.toThrow(/numero/i);
  });

  it("comando desconhecido recusa e mostra o uso", async () => {
    const t = await createTestDb(); close = t.close;
    await expect(runBlacklistCommand(t.db, ["destruir"])).rejects.toThrow(/uso/i);
  });
});
