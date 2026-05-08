import { mysqlTable, varchar, datetime, int, text, uniqueIndex, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { postsTable } from "./posts.ts";
import { platformConnectionsTable } from "./platform-connections.ts";

export const postSyndicationsTable = mysqlTable(
  "post_syndications",
  {
    id: int("id").autoincrement().primaryKey(),
    postId: int("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    platformConnectionId: int("platform_connection_id")
      .notNull()
      .references(() => platformConnectionsTable.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 512 }),
    externalUrl: varchar("external_url", { length: 2048 }),
    // confirmed enum: pending | success | failed
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    errorMessage: text("error_message"),
    syncedAt: datetime("synced_at", { mode: "string", fsp: 3 }),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => ({
    // Prevents double-syndication if the async dispatcher fires more than once.
    postConnectionUnique: uniqueIndex("post_syndications_post_connection_unique").on(
      table.postId,
      table.platformConnectionId,
    ),
    postIdx: index("post_syndications_post_idx").on(table.postId),
    connectionIdx: index("post_syndications_connection_idx").on(table.platformConnectionId),
  }),
);

export type PostSyndication = typeof postSyndicationsTable.$inferSelect;
export type InsertPostSyndication = typeof postSyndicationsTable.$inferInsert;
