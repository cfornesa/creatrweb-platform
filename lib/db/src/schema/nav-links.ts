import { mysqlTable, varchar, int, datetime, boolean, index } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const navLinksTable = mysqlTable(
  "nav_links",
  {
    id: int("id").autoincrement().primaryKey(),
    label: varchar("label", { length: 64 }).notNull(),
    url: varchar("url", { length: 2048 }).notNull(),
    openInNewTab: boolean("open_in_new_tab").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
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
