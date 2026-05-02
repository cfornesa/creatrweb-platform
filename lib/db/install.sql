-- ============================================================================
--  Microblog — full database install script
--
--  Run this once on a fresh MySQL 8+ / MariaDB 10.5+ database to create every
--  table the app expects. Use this if you are forking the repo and applying
--  schema by hand (e.g. via phpMyAdmin on a shared host like Hostinger).
--
--  On Replit (and any other environment that boots `npm run dev:api`), the
--  same tables are created automatically by `ensureTables()` in
--  `lib/db/src/migrate.ts` at server startup, so this script is optional.
--
--  Safe to re-run: every CREATE uses `IF NOT EXISTS`. Re-running will NOT
--  drop or modify existing rows.
--
--  Order matters because of foreign keys:
--    1. users
--    2. accounts, sessions, verification_tokens (Auth.js — depend on users)
--    3. feed_sources, feed_items_seen
--    4. posts (depends on users + feed_sources)
--    5. comments, reactions (depend on posts + users)
--    6. site_settings (singleton, no dependencies)
--
--  After running this script, seed the singleton row in `site_settings` (see
--  the bottom of this file) and then promote your first signed-in user to
--  the `owner` role:
--
--    UPDATE users SET role='owner' WHERE email='you@example.com';
--
--  …or run `npm run promote-owner --workspace=@workspace/scripts -- --email
--  you@example.com` from the repo.
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. users — local accounts (Auth.js + app-owned profile + per-user theme)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`               VARCHAR(191) NOT NULL PRIMARY KEY,
  `name`             VARCHAR(255),
  `username`         VARCHAR(255),
  `email`            VARCHAR(191),
  `email_verified`   TIMESTAMP(3) NULL DEFAULT NULL,
  `image`            VARCHAR(2048),
  `bio`              TEXT,
  `website`          VARCHAR(2048),
  `social_links`     JSON,
  `role`             VARCHAR(32) NOT NULL DEFAULT 'member',
  `status`           VARCHAR(32) NOT NULL DEFAULT 'active',
  `created_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_login_at`    DATETIME(3),
  `post_count`       INT NOT NULL DEFAULT 0,

  -- Per-user profile-page theme. NULL on every column == "use site default".
  `theme`                        VARCHAR(32),
  `palette`                      VARCHAR(32),
  `color_background`             VARCHAR(64),
  `color_foreground`             VARCHAR(64),
  `color_background_dark`        VARCHAR(64),
  `color_foreground_dark`        VARCHAR(64),
  `color_primary`                VARCHAR(64),
  `color_primary_foreground`     VARCHAR(64),
  `color_secondary`              VARCHAR(64),
  `color_secondary_foreground`   VARCHAR(64),
  `color_accent`                 VARCHAR(64),
  `color_accent_foreground`      VARCHAR(64),
  `color_muted`                  VARCHAR(64),
  `color_muted_foreground`       VARCHAR(64),
  `color_destructive`            VARCHAR(64),
  `color_destructive_foreground` VARCHAR(64),

  UNIQUE KEY `users_email_unique`    (`email`),
  UNIQUE KEY `users_username_unique` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Auth.js tables: accounts, sessions, verification_tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `accounts` (
  `user_id`              VARCHAR(191) NOT NULL,
  `type`                 VARCHAR(64)  NOT NULL,
  `provider`             VARCHAR(191) NOT NULL,
  `provider_account_id`  VARCHAR(191) NOT NULL,
  `refresh_token`        TEXT,
  `access_token`         TEXT,
  `expires_at`           INT,
  `token_type`           VARCHAR(64),
  `scope`                TEXT,
  `id_token`             TEXT,
  `session_state`        VARCHAR(255),
  PRIMARY KEY (`provider`, `provider_account_id`),
  CONSTRAINT `accounts_user_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `session_token` VARCHAR(191) NOT NULL PRIMARY KEY,
  `user_id`       VARCHAR(191) NOT NULL,
  `expires`       TIMESTAMP(3) NOT NULL,
  CONSTRAINT `sessions_user_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `verification_tokens` (
  `identifier` VARCHAR(191) NOT NULL,
  `token`      VARCHAR(191) NOT NULL,
  `expires`    TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (`identifier`, `token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Inbound feeds (PESOS): feed_sources + feed_items_seen
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `feed_sources` (
  `id`               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name`             VARCHAR(255)  NOT NULL,
  `feed_url`         VARCHAR(2048) NOT NULL,
  `site_url`         VARCHAR(2048),
  `cadence`          VARCHAR(16) NOT NULL DEFAULT 'daily',  -- daily | weekly | monthly
  `enabled`          INT NOT NULL DEFAULT 1,                -- 1 | 0
  `last_fetched_at`  DATETIME(3),
  `next_fetch_at`    DATETIME(3),                           -- NULL = due
  `last_status`      VARCHAR(32),
  `last_error`       TEXT,
  `items_imported`   INT NOT NULL DEFAULT 0,
  `created_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feed_items_seen` (
  `id`         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `source_id`  INT NOT NULL,
  `guid_hash`  CHAR(64) NOT NULL,    -- lowercase hex SHA-256
  `seen_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `post_id`    INT,                  -- back-pointer to posts.id (soft link, no FK)
  UNIQUE KEY `feed_items_seen_source_guid_unique` (`source_id`, `guid_hash`),
  KEY `feed_items_seen_source_idx` (`source_id`),
  CONSTRAINT `feed_items_seen_source_fk`
    FOREIGN KEY (`source_id`) REFERENCES `feed_sources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. posts — owner-authored AND feed-imported
--    (FULLTEXT index on `content_text` powers /api/posts/search)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `posts` (
  `id`                    INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `author_id`             VARCHAR(191) NOT NULL,         -- 'feed:<sourceId>' for imports
  `author_user_id`        VARCHAR(191),                  -- FK -> users.id (NULL for imports)
  `author_name`           VARCHAR(255) NOT NULL,
  `author_image_url`      VARCHAR(2048),
  `content`               TEXT NOT NULL,                 -- canonical body (HTML or plain)
  `content_text`          TEXT,                          -- stripped/plain shadow for FULLTEXT
  `content_format`        VARCHAR(16) NOT NULL DEFAULT 'plain',  -- 'plain' | 'html'
  `status`                VARCHAR(16) NOT NULL DEFAULT 'published', -- 'published' | 'pending'
  `source_feed_id`        INT,                           -- FK -> feed_sources.id
  `source_guid`           VARCHAR(1024),
  `source_canonical_url`  VARCHAR(2048),
  `created_at`            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `posts_status_idx`        (`status`),
  KEY `posts_source_feed_idx`   (`source_feed_id`),
  FULLTEXT KEY `posts_content_text_fulltext` (`content_text`),
  CONSTRAINT `posts_author_user_id_fk`
    FOREIGN KEY (`author_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `posts_source_feed_id_fk`
    FOREIGN KEY (`source_feed_id`) REFERENCES `feed_sources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. comments + reactions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `comments` (
  `id`                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `post_id`           INT NOT NULL,
  `author_id`         VARCHAR(191) NOT NULL,
  `author_user_id`    VARCHAR(191),
  `author_name`       VARCHAR(255) NOT NULL,
  `author_image_url`  VARCHAR(2048),
  `content`           TEXT NOT NULL,
  `created_at`        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `comments_post_id_fk`
    FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `comments_author_user_id_fk`
    FOREIGN KEY (`author_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reactions` (
  `id`         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `post_id`    INT NOT NULL,
  `user_id`    VARCHAR(191) NOT NULL,
  `type`       VARCHAR(32) NOT NULL,    -- 'like' is the only value today
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `reactions_post_user_type_unique` (`post_id`, `user_id`, `type`),
  CONSTRAINT `reactions_post_id_fk`
    FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reactions_user_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. site_settings — singleton row at id=1
--    See `lib/db/site_settings_install.sql` for the seed defaults; this
--    create-only block is duplicated here so the install script is one-shot.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `site_settings` (
  `id`                            INT NOT NULL PRIMARY KEY DEFAULT 1,
  `theme`                         VARCHAR(32) NOT NULL DEFAULT 'bauhaus',
  `palette`                       VARCHAR(32) NOT NULL DEFAULT 'bauhaus',
  `site_title`                    VARCHAR(255) NOT NULL,
  `hero_heading`                  VARCHAR(255) NOT NULL,
  `hero_subheading`               TEXT NOT NULL,
  `about_heading`                 VARCHAR(255) NOT NULL,
  `about_body`                    TEXT NOT NULL,
  `copyright_line`                VARCHAR(255) NOT NULL,
  `footer_credit`                 VARCHAR(255) NOT NULL,
  `cta_label`                     VARCHAR(255) NOT NULL,
  `cta_href`                      VARCHAR(2048) NOT NULL,
  `color_background`              VARCHAR(64) NOT NULL,
  `color_foreground`              VARCHAR(64) NOT NULL,
  `color_background_dark`         VARCHAR(64) NOT NULL,
  `color_foreground_dark`         VARCHAR(64) NOT NULL,
  `color_primary`                 VARCHAR(64) NOT NULL,
  `color_primary_foreground`      VARCHAR(64) NOT NULL,
  `color_secondary`               VARCHAR(64) NOT NULL,
  `color_secondary_foreground`    VARCHAR(64) NOT NULL,
  `color_accent`                  VARCHAR(64) NOT NULL,
  `color_accent_foreground`       VARCHAR(64) NOT NULL,
  `color_muted`                   VARCHAR(64) NOT NULL,
  `color_muted_foreground`        VARCHAR(64) NOT NULL,
  `color_destructive`             VARCHAR(64) NOT NULL,
  `color_destructive_foreground`  VARCHAR(64) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the singleton row with neutral placeholder copy. Customize in the
-- /settings UI after first login (or edit this block before running).
-- INSERT IGNORE means re-running this script will not overwrite your edits.
INSERT IGNORE INTO `site_settings` (
  `id`, `theme`, `palette`,
  `site_title`, `hero_heading`, `hero_subheading`,
  `about_heading`, `about_body`,
  `copyright_line`, `footer_credit`,
  `cta_label`, `cta_href`,
  `color_background`, `color_foreground`,
  `color_background_dark`, `color_foreground_dark`,
  `color_primary`, `color_primary_foreground`,
  `color_secondary`, `color_secondary_foreground`,
  `color_accent`, `color_accent_foreground`,
  `color_muted`, `color_muted_foreground`,
  `color_destructive`, `color_destructive_foreground`
) VALUES (
  1, 'bauhaus', 'bauhaus',
  'My Microblog', 'Welcome',
  'A short tagline goes here. Edit this in /settings after you sign in and become the owner.',
  'About', 'Tell visitors who you are and what this site is for.',
  'Your Name', 'Built with the open-source Microblog template.',
  'Get in touch', '/',
  '0 0% 100%', '0 0% 0%',
  '0 0% 0%',   '0 0% 100%',
  '0 100% 50%','0 0% 100%',
  '240 100% 50%','0 0% 100%',
  '60 100% 50%', '0 0% 0%',
  '60 100% 50%', '0 0% 0%',
  '0 100% 50%',  '0 0% 100%'
);

-- ============================================================================
-- Useful queries for forkers — paste into phpMyAdmin / your MySQL client.
-- A mix of read (SELECT) and write (UPDATE / DELETE) statements; uncomment
-- the line(s) you want to run. Read each query carefully before executing
-- — the writes are not undoable without a backup.
-- ============================================================================

-- 1. Promote a user to the owner role (the ONLY role that sees the admin UI).
--    Run this once after the user has signed in for the first time via OAuth.
-- UPDATE `users` SET `role` = 'owner' WHERE `email` = 'you@example.com';

-- 2. List every user with their role + signup time.
-- SELECT id, email, username, role, status, created_at, last_login_at
--   FROM users
--   ORDER BY created_at DESC;

-- 3. Demote (or block) a user.
-- UPDATE `users` SET `role` = 'member' WHERE `email` = 'them@example.com';
-- UPDATE `users` SET `status` = 'blocked' WHERE `email` = 'them@example.com';

-- 4. Re-customize the site title / hero copy directly (faster than the UI for bulk edits).
-- UPDATE `site_settings`
--   SET site_title = 'My New Title',
--       hero_heading = 'New hero copy',
--       hero_subheading = 'New subtitle…'
-- WHERE id = 1;

-- 5. List feed subscriptions and how many items each one has imported.
-- SELECT id, name, feed_url, cadence, enabled, last_fetched_at,
--        next_fetch_at, items_imported, last_status
--   FROM feed_sources
--   ORDER BY name;

-- 6. Pause a feed source without unsubscribing (stops the scheduled refresh).
-- UPDATE `feed_sources` SET `enabled` = 0 WHERE `id` = ?;

-- 7. Show the moderation queue (posts waiting for owner approval).
-- SELECT p.id, p.created_at, p.author_name, fs.name AS source,
--        LEFT(p.content_text, 120) AS preview
--   FROM posts p
--   LEFT JOIN feed_sources fs ON fs.id = p.source_feed_id
--   WHERE p.status = 'pending'
--   ORDER BY p.created_at DESC;

-- 8. Approve or reject a single pending post by id.
-- UPDATE `posts` SET `status` = 'published' WHERE `id` = ? AND `status` = 'pending';
-- DELETE FROM `posts` WHERE `id` = ? AND `status` = 'pending';

-- 9. Find imported posts whose `content_text` shadow column is NULL
--    (these are picked up by the automatic backfill at server startup).
-- SELECT id, created_at, author_name FROM posts
--   WHERE content_text IS NULL ORDER BY id DESC LIMIT 50;

-- 10. Most-commented published posts (top 20).
-- SELECT p.id, p.author_name, COUNT(c.id) AS comment_count, p.created_at
--   FROM posts p
--   LEFT JOIN comments c ON c.post_id = p.id
--   WHERE p.status = 'published'
--   GROUP BY p.id
--   ORDER BY comment_count DESC, p.created_at DESC
--   LIMIT 20;

-- 11. Word-count stats by author for published posts.
-- SELECT author_name,
--        COUNT(*) AS posts,
--        SUM(CHAR_LENGTH(content_text) - CHAR_LENGTH(REPLACE(content_text, ' ', '')) + 1) AS approx_words
--   FROM posts
--   WHERE status = 'published'
--   GROUP BY author_name
--   ORDER BY posts DESC;

-- 12. Same full-text query the app uses (boolean mode, prefix match) for "hello world".
-- SELECT id, author_name, created_at,
--        MATCH(content_text) AGAINST ('+hello* +world*' IN BOOLEAN MODE) AS score
--   FROM posts
--   WHERE status = 'published'
--     AND MATCH(content_text) AGAINST ('+hello* +world*' IN BOOLEAN MODE)
--   ORDER BY score DESC
--   LIMIT 20;

-- 13. Vacuum check: rows in `feed_items_seen` whose linked post no longer exists.
--     Safe to delete — a re-fetch will create a fresh seen row + post.
-- SELECT s.id, s.source_id, s.guid_hash, s.post_id
--   FROM feed_items_seen s
--   LEFT JOIN posts p ON p.id = s.post_id
--   WHERE s.post_id IS NOT NULL AND p.id IS NULL;
-- DELETE s FROM feed_items_seen s
--   LEFT JOIN posts p ON p.id = s.post_id
--   WHERE s.post_id IS NOT NULL AND p.id IS NULL;

-- 14. Reset `next_fetch_at` for every enabled source (forces a refresh on
--     the next scheduled run; useful after manual edits to cadence).
-- UPDATE `feed_sources` SET `next_fetch_at` = NULL WHERE `enabled` = 1;

-- 15. Hard reset: blank out per-user theme on a single user (snaps them
--     back to the site default everywhere).
-- UPDATE `users`
--   SET theme = NULL, palette = NULL,
--       color_background = NULL, color_foreground = NULL,
--       color_background_dark = NULL, color_foreground_dark = NULL,
--       color_primary = NULL, color_primary_foreground = NULL,
--       color_secondary = NULL, color_secondary_foreground = NULL,
--       color_accent = NULL, color_accent_foreground = NULL,
--       color_muted = NULL, color_muted_foreground = NULL,
--       color_destructive = NULL, color_destructive_foreground = NULL
--   WHERE email = 'them@example.com';
