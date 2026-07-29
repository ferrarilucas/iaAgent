import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser } from "../src/repository/users";
import { getSpaceMembers } from "../src/repository/spaces";
import { spaceMembers } from "../src/schema";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("getSpaceMembers", () => {
  it("retorna membros com nome e papel", async () => {
    const t = await createTestDb(); close = t.close;
    const a = await bootstrapUser(t.db, { whatsappNumber: "111", name: "Lucas" });
    const b = await bootstrapUser(t.db, { whatsappNumber: "222", name: "Ana" });
    await t.db.insert(spaceMembers).values({ spaceId: a.space.id, userId: b.user.id, role: "member" });

    const membros = await getSpaceMembers(t.db, a.space.id);
    const byName = Object.fromEntries(membros.map((m) => [m.name, m.role]));
    expect(byName["Lucas"]).toBe("owner");
    expect(byName["Ana"]).toBe("member");
    expect(membros).toHaveLength(2);
  });
});
