import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "../../../packages/db/test/helpers";
import { bootstrapUser, seedCategories } from "@ia/db";
import {
  registrarTransacaoImpl,
  resumoImpl,
  corrigirUltimaImpl,
  apagarUltimaImpl,
} from "../src/agent/tools";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

async function setup() {
  const t = await createTestDb(); close = t.close;
  const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "5599", name: "L" });
  await seedCategories(t.db, space.id);
  return { db: t.db, userId: user.id, spaceId: space.id };
}

describe("tools impl", () => {
  it("registrar cria lancamento resolvendo categoria por nome", async () => {
    const { db, userId, spaceId } = await setup();
    const res = await registrarTransacaoImpl(db, {
      userId, spaceId,
      itens: [{ type: "despesa", amount: "50.00", categoria: "alimentacao", occurredAt: "2026-07-05", source: "texto" }],
    });
    expect(res.criadas).toBe(1);
    const resumo = await resumoImpl(db, { spaceId, from: "2026-07-01", to: "2026-07-31", type: "despesa" });
    expect(resumo.total).toBe("50.00");
  });

  it("corrigir e apagar agem sobre o ultimo lancamento", async () => {
    const { db, userId, spaceId } = await setup();
    await registrarTransacaoImpl(db, { userId, spaceId, itens: [{ type: "despesa", amount: "50.00", categoria: "alimentacao", occurredAt: "2026-07-05", source: "texto" }] });
    const corr = await corrigirUltimaImpl(db, { userId, spaceId, categoria: "transporte" });
    expect(corr.ok).toBe(true);
    const del = await apagarUltimaImpl(db, { userId });
    expect(del.ok).toBe(true);
  });
});
