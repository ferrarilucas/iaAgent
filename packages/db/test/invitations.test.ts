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

    await acceptInvitation(t.db, invite.id, guest.user.id);

    const guestSpace = await getSpaceForUser(t.db, guest.user.id);
    expect(guestSpace?.id).toBe(owner.space.id);

    const members = await getSpaceMemberUserIds(t.db, owner.space.id);
    expect(members.sort()).toEqual([owner.user.id, guest.user.id].sort());

    const stillPending = await getPendingInvitationsForNumber(t.db, "222");
    expect(stillPending).toHaveLength(0);
  });
});
