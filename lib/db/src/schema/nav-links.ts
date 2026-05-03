import { mysqlTable, varchar, int, datetime, boolean, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * `nav_links` — owner-managed navbar entries. Originally external-only
 * (Task #24); Task #25 extended this additively to a unified
 * "nav_items" model with a `kind` discriminator:
 *
 *   - `kind='external'` — the original Task #24 use case. `url` is an
 *     absolute external URL.
 *   - `kind='page'` — a row that mirrors a `pages` row. `pageId` is
 *     set; `url` is left empty/internal and resolved at render time.
 *   - `kind='system'` — built-in site routes (e.g. `/feeds`). Created
 *     by the migration; the owner can hide via `visible=false` but
 *     not delete in the management UI.
 *
 * The table name is intentionally kept as `nav_links` so the #24
 * migration is purely additive — no rename. Application code uses
 * "nav items" terminology for the unified concept.
 */
export const navLinksTable = mysqlTable(
  "nav_links",
  {
    id: int("id").autoincrement().primaryKey(),
    label: varchar("label", { length: 64 }).notNull(),
    url: varchar("url", { length: 2048 }).notNull(),
    openInNewTab: boolean("open_in_new_tab").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    kind: varchar("kind", { length: 16 }).notNull().default("external"),
    pageId: int("page_id"),
    visible: boolean("visible").notNull().default(true),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => ({
    sortOrderIdx: index("nav_links_sort_order_idx").on(t.sortOrder),
  }),
);

export type NavLink = typeof navLinksTable.$inferSelect;
export type InsertNavLink = typeof navLinksTable.$inferInsert;
