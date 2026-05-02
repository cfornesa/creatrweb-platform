import { mysqlTable, varchar, text, int, datetime } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const siteSettingsTable = mysqlTable("site_settings", {
  id: int("id").primaryKey().default(1),

  theme: varchar("theme", { length: 32 }).notNull().default("bauhaus"),
  palette: varchar("palette", { length: 32 }).notNull().default("bauhaus"),

  siteTitle: varchar("site_title", { length: 255 }).notNull(),
  heroHeading: varchar("hero_heading", { length: 255 }).notNull(),
  heroSubheading: text("hero_subheading").notNull(),
  aboutHeading: varchar("about_heading", { length: 255 }).notNull(),
  aboutBody: text("about_body").notNull(),
  copyrightLine: varchar("copyright_line", { length: 255 }).notNull(),
  footerCredit: varchar("footer_credit", { length: 255 }).notNull(),
  ctaLabel: varchar("cta_label", { length: 255 }).notNull(),
  ctaHref: varchar("cta_href", { length: 2048 }).notNull(),

  colorBackground: varchar("color_background", { length: 64 }).notNull(),
  colorForeground: varchar("color_foreground", { length: 64 }).notNull(),
  colorBackgroundDark: varchar("color_background_dark", { length: 64 }).notNull(),
  colorForegroundDark: varchar("color_foreground_dark", { length: 64 }).notNull(),
  colorPrimary: varchar("color_primary", { length: 64 }).notNull(),
  colorPrimaryForeground: varchar("color_primary_foreground", { length: 64 }).notNull(),
  colorSecondary: varchar("color_secondary", { length: 64 }).notNull(),
  colorSecondaryForeground: varchar("color_secondary_foreground", { length: 64 }).notNull(),
  colorAccent: varchar("color_accent", { length: 64 }).notNull(),
  colorAccentForeground: varchar("color_accent_foreground", { length: 64 }).notNull(),
  colorMuted: varchar("color_muted", { length: 64 }).notNull(),
  colorMutedForeground: varchar("color_muted_foreground", { length: 64 }).notNull(),
  colorDestructive: varchar("color_destructive", { length: 64 }).notNull(),
  colorDestructiveForeground: varchar("color_destructive_foreground", { length: 64 }).notNull(),

  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
export type InsertSiteSettings = typeof siteSettingsTable.$inferInsert;

export const siteSettingsDefaults = {
  theme: "bauhaus",
  palette: "bauhaus",

  siteTitle: "Chris Fornesa",
  heroHeading: "Buenas at Kumusta!",
  heroSubheading:
    "Welcome to my digital garden where I cultivate my thoughts, feelings, hopes, dreams, and more.",
  aboutHeading: "About This Platform",
  aboutBody:
    "A space where I share my thoughts, ideas, and experiences with the world. Built with React using Replit, Claude Code, Codex, and Gemini CLI.",
  copyrightLine: "Chris Fornesa",
  footerCredit: "Built with React using Replit, Claude Code, Codex, and Gemini CLI.",
  ctaLabel: "Learn More About Me",
  ctaHref: "/users/@cfornesa",

  colorBackground: "0 0% 100%",
  colorForeground: "0 0% 0%",
  colorBackgroundDark: "0 0% 0%",
  colorForegroundDark: "0 0% 100%",
  colorPrimary: "0 100% 50%",
  colorPrimaryForeground: "0 0% 100%",
  colorSecondary: "240 100% 50%",
  colorSecondaryForeground: "0 0% 100%",
  colorAccent: "60 100% 50%",
  colorAccentForeground: "0 0% 0%",
  colorMuted: "60 100% 50%",
  colorMutedForeground: "0 0% 0%",
  colorDestructive: "0 100% 50%",
  colorDestructiveForeground: "0 0% 100%",
} as const;
