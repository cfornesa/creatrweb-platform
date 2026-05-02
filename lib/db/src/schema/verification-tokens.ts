import { mysqlTable, varchar, timestamp, primaryKey } from "drizzle-orm/mysql-core";

export const verificationTokensTable = mysqlTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 191 }).notNull(),
    token: varchar("token", { length: 191 }).notNull(),
    expires: timestamp("expires", { mode: "date", fsp: 3 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);

export type VerificationToken = typeof verificationTokensTable.$inferSelect;
export type InsertVerificationToken = typeof verificationTokensTable.$inferInsert;
