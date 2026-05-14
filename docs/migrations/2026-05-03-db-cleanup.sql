-- SUPERSEDED — do not run; see docs/db-cleanup-report.md
-- Auto-generated database cleanup migration
-- Generated: 2026-05-03T09:48:23.882Z
-- Database: u276695328_chrisfornesa
-- Reference: docs/db-cleanup-report.md

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Drop unused columns and FK from posts (releases FK on feed_sources)
ALTER TABLE posts DROP FOREIGN KEY posts_source_feed_id_fk;
ALTER TABLE posts DROP INDEX posts_source_feed_idx;
ALTER TABLE posts DROP INDEX posts_status_idx;
ALTER TABLE posts DROP INDEX posts_content_text_fulltext;
ALTER TABLE posts
  DROP COLUMN status,
  DROP COLUMN source_feed_id,
  DROP COLUMN source_guid,
  DROP COLUMN source_canonical_url,
  DROP COLUMN content_text;

-- 2. Drop unused tables (children before parents)
DROP TABLE IF EXISTS feed_items_seen;
DROP TABLE IF EXISTS post_categories;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS nav_links;
DROP TABLE IF EXISTS pages;
DROP TABLE IF EXISTS site_settings;
DROP TABLE IF EXISTS feed_sources;

-- 3. Drop unused theming columns from users
ALTER TABLE users
  DROP COLUMN theme,
  DROP COLUMN palette,
  DROP COLUMN color_background,
  DROP COLUMN color_foreground,
  DROP COLUMN color_background_dark,
  DROP COLUMN color_foreground_dark,
  DROP COLUMN color_primary,
  DROP COLUMN color_primary_foreground,
  DROP COLUMN color_secondary,
  DROP COLUMN color_secondary_foreground,
  DROP COLUMN color_accent,
  DROP COLUMN color_accent_foreground,
  DROP COLUMN color_muted,
  DROP COLUMN color_muted_foreground,
  DROP COLUMN color_destructive,
  DROP COLUMN color_destructive_foreground;

-- 4. Drop the duplicate username index (keep users_username_unique)
ALTER TABLE users DROP INDEX username;

SET FOREIGN_KEY_CHECKS = 1;
