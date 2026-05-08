import { mysqlTable, varchar, datetime, int, text, uniqueIndex } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// Site-wide OAuth app credentials for POSSE outbound syndication.
// One row per platform (wordpress_com | blogger). Not per-user — these are
// the OAuth application registration credentials (CLIENT_ID + CLIENT_SECRET)
// entered once by the site owner via Admin → Platforms. Separate from
// platform_connections which stores per-user access tokens.
export const platformOAuthAppsTable = mysqlTable(
  "platform_oauth_apps",
  {
    id: int("id").autoincrement().primaryKey(),
    // Platform key — same enum as platform_connections
    platform: varchar("platform", { length: 32 }).notNull(),
    // AES-256-GCM encrypted CLIENT_ID and CLIENT_SECRET
    encryptedClientId: text("encrypted_client_id"),
    encryptedClientSecret: text("encrypted_client_secret"),
    blogUrl: varchar("blog_url", { length: 500 }),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => ({
    platformUnique: uniqueIndex("platform_oauth_apps_platform_unique").on(table.platform),
  }),
);

export type PlatformOAuthApp = typeof platformOAuthAppsTable.$inferSelect;
export type InsertPlatformOAuthApp = typeof platformOAuthAppsTable.$inferInsert;
