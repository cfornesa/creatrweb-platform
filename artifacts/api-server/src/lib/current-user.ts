import { getSession } from "@auth/express";
import type { Request } from "express";
import { db, eq, usersTable } from "@workspace/db";
import { authConfig } from "../auth/config";

type SessionUserWithId = {
  id?: string;
  role?: string;
  status?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export async function loadAuthSession(req: Request) {
  return getSession(req, authConfig);
}

export async function loadCurrentUser(req: Request) {
  const session = await loadAuthSession(req);
  const sessionUser = session?.user as SessionUserWithId | undefined;
  const userId = sessionUser?.id;

  if (!userId) {
    return { session, user: null };
  }

  const userRows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const user = userRows[0] ?? null;

  return {
    session,
    user,
  };
}
