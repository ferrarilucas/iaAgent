import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSpaceForUser } from "@ia/db";
import { auth } from "./auth";
import { db } from "./db";

export async function requireContext() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const space = await getSpaceForUser(db, session.user.id);
  if (!space) redirect("/login");
  return {
    userId: session.user.id,
    spaceId: space.id,
    userName: session.user.name ?? null,
    phoneNumber: session.user.phoneNumber ?? null,
  };
}
