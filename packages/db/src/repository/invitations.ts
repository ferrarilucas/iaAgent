import { and, eq } from "drizzle-orm";
import type { Db } from "../client";
import { invitations, spaceMembers } from "../schema";
import type { Invitation } from "../types";

export async function createInvitation(
  db: Db,
  input: { spaceId: string; invitedBy: string; invitedNumber: string },
): Promise<Invitation> {
  const [row] = await db
    .insert(invitations)
    .values({ spaceId: input.spaceId, invitedBy: input.invitedBy, invitedNumber: input.invitedNumber })
    .returning();
  return row;
}

export async function getPendingInvitationsForNumber(
  db: Db,
  whatsappNumber: string,
): Promise<Invitation[]> {
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.invitedNumber, whatsappNumber), eq(invitations.status, "pending")));
}

export async function acceptInvitation(
  db: Db,
  invitationId: string,
  acceptingUserId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .limit(1);
    if (!invite || invite.status !== "pending") {
      throw new Error("convite invalido ou ja respondido");
    }
    await tx.update(invitations).set({ status: "accepted" }).where(eq(invitations.id, invitationId));
    await tx.delete(spaceMembers).where(eq(spaceMembers.userId, acceptingUserId));
    await tx
      .insert(spaceMembers)
      .values({ spaceId: invite.spaceId, userId: acceptingUserId, role: "member" });
  });
}
