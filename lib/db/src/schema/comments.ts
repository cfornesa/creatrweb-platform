import { mysqlTable, varchar, text, int, datetime } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { postsTable } from "./posts.ts";
import { usersTable } from "./users.ts";

export const commentsTable = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  authorId: varchar("author_id", { length: 191 }).notNull(),
  authorUserId: varchar("author_user_id", { length: 191 }).references(() => usersTable.id, { onDelete: "set null" }),
  authorName: varchar("author_name", { length: 255 }).notNull(),
  authorImageUrl: varchar("author_image_url", { length: 2048 }),
  content: text("content").notNull(),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

export const insertCommentSchema = createInsertSchema(commentsTable)
  .omit({
    id: true,
    createdAt: true,
    postId: true,
    authorId: true,
    authorUserId: true,
    authorName: true,
    authorImageUrl: true,
  })
  .extend({
    content: z.string().min(1).max(500),
  });

export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof commentsTable.$inferSelect;
