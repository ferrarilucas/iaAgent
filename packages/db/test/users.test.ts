import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import {
  bootstrapUser,
  getUserByWhatsappNumber,
  getSpaceForUser,
  getSpaceMemberUserIds,
} from "../src/repository/users";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("users repository", () => {
  it("bootstrap cria usuario, espaco pessoal e membership owner", async () => {
    const t = await createTestDb();
    close = t.close;
    const { user, space } = await bootstrapUser(t.db, { whatsappNumber: "5511999", name: "Lucas" });

    expect(user.whatsappNumber).toBe("5511999");
    expect(space.name).toContain("Lucas");

    const found = await getUserByWhatsappNumber(t.db, "5511999");
    expect(found?.id).toBe(user.id);

    const userSpace = await getSpaceForUser(t.db, user.id);
    expect(userSpace?.id).toBe(space.id);

    const memberIds = await getSpaceMemberUserIds(t.db, space.id);
    expect(memberIds).toEqual([user.id]);
  });

  it("getUserByWhatsappNumber retorna undefined para numero desconhecido", async () => {
    const t = await createTestDb();
    close = t.close;
    expect(await getUserByWhatsappNumber(t.db, "0000")).toBeUndefined();
  });
});
