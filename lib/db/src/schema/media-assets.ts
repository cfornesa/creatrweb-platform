import { mysqlTable, varchar, int, datetime, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const mediaAssetsTable = mysqlTable(
  "media_assets",
  {
    id: int("id").autoincrement().primaryKey(),
    url: varchar("url", { length: 2048 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    uploadedAt: datetime("uploaded_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    altText: varchar("alt_text", { length: 500 }),
  },
  (t) => ({
    uploadedAtIdx: index("media_assets_uploaded_at_idx").on(t.uploadedAt),
  }),
);

export type MediaAsset = typeof mediaAssetsTable.$inferSelect;
export type InsertMediaAsset = typeof mediaAssetsTable.$inferInsert;
