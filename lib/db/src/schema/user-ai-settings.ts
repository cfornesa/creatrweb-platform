import { mysqlTable, varchar, datetime, int, text, primaryKey } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users.ts";

export const userAiVendorSettingsTable = mysqlTable(
  "user_ai_vendor_settings",
  {
    userId: varchar("user_id", { length: 191 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    vendor: varchar("vendor", { length: 64 }).notNull(),
    enabled: int("enabled").notNull().default(0),
    model: varchar("model", { length: 191 }),
    encryptedApiKey: text("encrypted_api_key"),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.vendor] }),
  }),
);

export type UserAiVendorSettings = typeof userAiVendorSettingsTable.$inferSelect;
export type InsertUserAiVendorSettings = typeof userAiVendorSettingsTable.$inferInsert;
