import { mysqlTable, varchar, datetime, int, uniqueIndex, timestamp, text, json } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const userRoles = ["owner", "member"] as const;
export const userStatuses = ["active", "blocked"] as const;

export const usersTable = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 191 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: varchar("name", { length: 255 }),
    username: varchar("username", { length: 255 }),
    email: varchar("email", { length: 191 }),
    emailVerified: timestamp("email_verified", { mode: "date", fsp: 3 }),
    image: varchar("image", { length: 2048 }),
    bio: text("bio"),
    website: varchar("website", { length: 2048 }),
    socialLinks: json("social_links").$type<Record<string, string>>(),
    role: varchar("role", { length: 32 }).notNull().default("member"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    lastLoginAt: datetime("last_login_at", { mode: "string", fsp: 3 }),
    postCount: int("post_count").notNull().default(0),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_unique").on(table.email),
    usernameIdx: uniqueIndex("users_username_unique").on(table.username),
  }),
);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
