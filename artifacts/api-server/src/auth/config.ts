import type { ExpressAuthConfig } from "@auth/express";
import GitHub from "@auth/express/providers/github";
import Google from "@auth/express/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, usersTable, accountsTable, sessionsTable, verificationTokensTable, eq } from "@workspace/db";

type SessionUserWithId = {
  id?: string;
  role?: string;
  status?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export const authConfig: ExpressAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable,
    accountsTable,
    sessionsTable,
    verificationTokensTable,
  }),
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: {
    strategy: "database",
  },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (!session.user || !user?.id) {
        return session;
      }

      const dbUserRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);
      const dbUser = dbUserRows[0];

      const sessionUser = session.user as SessionUserWithId;
      sessionUser.id = user.id;
      sessionUser.role = dbUser?.role ?? "member";
      sessionUser.status = dbUser?.status ?? "active";

      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user?.id) {
        return;
      }

      await db
        .update(usersTable)
        .set({
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(usersTable.id, user.id));
    },
  },
};
