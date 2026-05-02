import { mysqlTable, varchar, text, int, datetime } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const postContentFormatSchema = z.enum(["plain", "html"]);

export const postsTable = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  authorId: varchar("author_id", { length: 191 }).notNull(),
  authorUserId: varchar("author_user_id", { length: 191 }).references(() => usersTable.id, { onDelete: "set null" }),
  authorName: varchar("author_name", { length: 255 }).notNull(),
  authorImageUrl: varchar("author_image_url", { length: 2048 }),
  content: text("content").notNull(),
  contentFormat: varchar("content_format", { length: 16 }).notNull().default("plain"),
  createdAt: datetime("created_at", { mode: "string", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

export const insertPostSchema = createInsertSchema(postsTable)
  .omit({
    id: true,
    createdAt: true,
    authorId: true,
    authorUserId: true,
    authorName: true,
    authorImageUrl: true,
  })
  .extend({
    content: z.string().min(1).max(40000),
    contentFormat: postContentFormatSchema.default("html"),
  });

export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;
