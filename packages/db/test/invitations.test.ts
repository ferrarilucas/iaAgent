import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "./helpers";
import { bootstrapUser, getSpaceForUser, getSpaceMemberUserIds } from "../src/repository/users";
import {
  createInvitation,
  getPendingInvitationsForNumber,
  acceptInvitation,
} from "../src/repository/invitations";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { if (close) await close(); });

describe("invitations repository", () => {
  it("aceitar convite move o convidado para o espaco compartilhado", async () => {
    const t = await createTestDb();
    close = t.close;
    const owner = await bootstrapUser(t.db, { whatsappNumber: "111", name: "Lucas" });
    const guest = await bootstrapUser(t.db, { whatsappNumber: "222", name: "Ana" });

    const invite = await createInvitation(t.db, {
      spaceId: owner.space.id,
      invitedBy: owner.user.id,
      invitedNumber: "222",
    });

    const pending = await getPendingInvitationsForNumber(t.db, "222");
    expect(pending.map((p) => p.id)).toContain(invite.id);

    await acceptInvitation(t.db, invite.id, guest.user.id, "222");

    const guestSpace = await getSpaceForUser(t.db, guest.user.id);
    expect(guestSpace?.id).toBe(owner.space.id);

    const members = await getSpaceMemberUserIds(t.db, owner.space.id);
    expect(members.sort()).toEqual([owner.user.id, guest.user.id].sort());

    const stillPending = await getPendingInvitationsForNumber(t.db, "222");
    expect(stillPending).toHaveLength(0);
  });

  it("aceitar convite ja respondido ou inexistente lanca erro", async () => {
    const t = await createTestDb();
    close = t.close;
    const owner = await bootstrapUser(t.db, { whatsappNumber: "333", name: "Lucas" });
    const guest = await bootstrapUser(t.db, { whatsappNumber: "444", name: "Ana" });

    const invite = await createInvitation(t.db, {
      spaceId: owner.space.id,
      invitedBy: owner.user.id,
      invitedNumber: "444",
    });

    await acceptInvitation(t.db, invite.id, guest.user.id, "444");

    await expect(acceptInvitation(t.db, invite.id, guest.user.id, "444")).rejects.toThrow();
    await expect(
      acceptInvitation(t.db, "00000000-0000-0000-0000-000000000000", guest.user.id, "444"),
    ).rejects.toThrow();
  });

  it("aceitar convite com numero diferente do convidado lanca erro e nao move o usuario", async () => {
    const t = await createTestDb();
    close = t.close;
    const owner = await bootstrapUser(t.db, { whatsappNumber: "555", name: "Lucas" });
    const guest = await bootstrapUser(t.db, { whatsappNumber: "666", name: "Ana" });
    const intruder = await bootstrapUser(t.db, { whatsappNumber: "777", name: "Bob" });

    const invite = await createInvitation(t.db, {
      spaceId: owner.space.id,
      invitedBy: owner.user.id,
      invitedNumber: "666",
    });

    await expect(
      acceptInvitation(t.db, invite.id, intruder.user.id, "777"),
    ).rejects.toThrow();

    const intruderSpace = await getSpaceForUser(t.db, intruder.user.id);
    expect(intruderSpace?.id).toBe(intruder.space.id);
    expect(intruderSpace?.id).not.toBe(owner.space.id);

    const pending = await getPendingInvitationsForNumber(t.db, "666");
    expect(pending.map((p) => p.id)).toContain(invite.id);
  });
});
