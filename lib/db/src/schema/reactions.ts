import { mysqlTable, varchar, int, datetime, uniqueIndex } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { postsTable } from "./posts.ts";
import { usersTable } from "./users.ts";

export const reactionTypes = ["like"] as const;

export const reactionsTable = mysqlTable(
  "reactions",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => ({
    reactionUniq: uniqueIndex("reactions_post_user_type_unique").on(
      table.postId,
      table.userId,
      table.type,
    ),
  }),
);

export type Reaction = typeof reactionsTable.$inferSelect;
export type InsertReaction = typeof reactionsTable.$inferInsert;
