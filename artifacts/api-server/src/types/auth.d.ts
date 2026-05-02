import type { Session } from "@auth/core/types";
import type { usersTable } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      authSession?: Session | null;
      currentUser?: typeof usersTable.$inferSelect | null;
    }
  }
}

export {};
