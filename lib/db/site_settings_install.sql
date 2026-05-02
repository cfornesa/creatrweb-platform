-- ============================================================================
--  site_settings table (Microblog admin panel)
--  Run this once on your existing MySQL database (e.g. via phpMyAdmin).
--  On Replit, the same table is created automatically by ensureTables() at
--  server startup — this script is for environments where you apply schema
--  changes by hand (e.g. Hostinger).
--
--  Safe to re-run: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `site_settings` (
  `id` INT NOT NULL PRIMARY KEY DEFAULT 1,
  `theme` VARCHAR(32) NOT NULL DEFAULT 'bauhaus',
  `palette` VARCHAR(32) NOT NULL DEFAULT 'bauhaus',
  `site_title` VARCHAR(255) NOT NULL,
  `hero_heading` VARCHAR(255) NOT NULL,
  `hero_subheading` TEXT NOT NULL,
  `about_heading` VARCHAR(255) NOT NULL,
  `about_body` TEXT NOT NULL,
  `copyright_line` VARCHAR(255) NOT NULL,
  `footer_credit` VARCHAR(255) NOT NULL,
  `cta_label` VARCHAR(255) NOT NULL,
  `cta_href` VARCHAR(2048) NOT NULL,
  `color_background` VARCHAR(64) NOT NULL,
  `color_foreground` VARCHAR(64) NOT NULL,
  `color_background_dark` VARCHAR(64) NOT NULL,
  `color_foreground_dark` VARCHAR(64) NOT NULL,
  `color_primary` VARCHAR(64) NOT NULL,
  `color_primary_foreground` VARCHAR(64) NOT NULL,
  `color_secondary` VARCHAR(64) NOT NULL,
  `color_secondary_foreground` VARCHAR(64) NOT NULL,
  `color_accent` VARCHAR(64) NOT NULL,
  `color_accent_foreground` VARCHAR(64) NOT NULL,
  `color_muted` VARCHAR(64) NOT NULL,
  `color_muted_foreground` VARCHAR(64) NOT NULL,
  `color_destructive` VARCHAR(64) NOT NULL,
  `color_destructive_foreground` VARCHAR(64) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill `theme` / `palette` columns on databases created before themes shipped.
-- Safe no-op if the column already exists (the IF NOT EXISTS clause works on
-- MySQL 8+ and MariaDB 10.0.2+; on older servers, drop the IF NOT EXISTS clause
-- and ignore the duplicate column error).
ALTER TABLE `site_settings`
  ADD COLUMN IF NOT EXISTS `theme` VARCHAR(32) NOT NULL DEFAULT 'bauhaus';
ALTER TABLE `site_settings`
  ADD COLUMN IF NOT EXISTS `palette` VARCHAR(32) NOT NULL DEFAULT 'bauhaus';

-- Seed the singleton row with the current Bauhaus tricolor defaults.
-- INSERT IGNORE means it is a no-op if id=1 already exists.
INSERT IGNORE INTO `site_settings` (
  `id`,
  `theme`,
  `palette`,
  `site_title`,
  `hero_heading`,
  `hero_subheading`,
  `about_heading`,
  `about_body`,
  `copyright_line`,
  `footer_credit`,
  `cta_label`,
  `cta_href`,
  `color_background`,
  `color_foreground`,
  `color_background_dark`,
  `color_foreground_dark`,
  `color_primary`,
  `color_primary_foreground`,
  `color_secondary`,
  `color_secondary_foreground`,
  `color_accent`,
  `color_accent_foreground`,
  `color_muted`,
  `color_muted_foreground`,
  `color_destructive`,
  `color_destructive_foreground`
) VALUES (
  1,
  'bauhaus',
  'bauhaus',
  'Chris Fornesa',
  'Buenas at Kumusta!',
  'Welcome to my digital garden where I cultivate my thoughts, feelings, hopes, dreams, and more.',
  'About This Platform',
  'A space where I share my thoughts, ideas, and experiences with the world. Built with React using Replit, Claude Code, Codex, and Gemini CLI.',
  'Chris Fornesa',
  'Built with React using Replit, Claude Code, Codex, and Gemini CLI.',
  'Learn More About Me',
  '/users/@cfornesa',
  '0 0% 100%',
  '0 0% 0%',
  '0 0% 0%',
  '0 0% 100%',
  '0 100% 50%',
  '0 0% 100%',
  '240 100% 50%',
  '0 0% 100%',
  '60 100% 50%',
  '0 0% 0%',
  '60 100% 50%',
  '0 0% 0%',
  '0 100% 50%',
  '0 0% 100%'
);
