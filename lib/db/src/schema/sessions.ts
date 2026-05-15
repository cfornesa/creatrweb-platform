import { mysqlTable, varchar, timestamp, index } from "drizzle-orm/mysql-core";
import { usersTable } from "./users.ts";

export const sessionsTable = mysqlTable(
  "sessions",
  {
    sessionToken: varchar("session_token", { length: 191 }).primaryKey(),
    userId: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date", fsp: 3 }).notNull(),
  },
  (t) => ({
    userIdIdx: index("sessions_user_id_idx").on(t.userId),
  }),
);

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
