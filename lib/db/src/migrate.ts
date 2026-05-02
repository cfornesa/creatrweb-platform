import type { RowDataPacket } from "mysql2/promise";
import { mysqlPool } from "./index";

type ColumnRow = RowDataPacket & {
  COLUMN_NAME: string;
};

async function getColumnNames(tableName: string): Promise<Set<string>> {
  const [rows] = await mysqlPool.query<ColumnRow[]>(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
    `,
    [tableName],
  );

  return new Set(rows.map((row) => row.COLUMN_NAME));
}

async function ensureColumn(
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  const columns = await getColumnNames(tableName);
  if (columns.has(columnName)) {
    return;
  }

  await mysqlPool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
}

export async function ensureTables(): Promise<void> {
  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(191) PRIMARY KEY,
      name VARCHAR(255) NULL,
      email VARCHAR(191) NULL,
      email_verified TIMESTAMP(3) NULL,
      image VARCHAR(2048) NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'member',
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_login_at DATETIME(3) NULL,
      post_count INT NOT NULL DEFAULT 0,
      UNIQUE KEY users_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id VARCHAR(191) NOT NULL,
      type VARCHAR(64) NOT NULL,
      provider VARCHAR(191) NOT NULL,
      provider_account_id VARCHAR(191) NOT NULL,
      refresh_token TEXT NULL,
      access_token TEXT NULL,
      expires_at INT NULL,
      token_type VARCHAR(64) NULL,
      scope TEXT NULL,
      id_token TEXT NULL,
      session_state VARCHAR(255) NULL,
      PRIMARY KEY (provider, provider_account_id),
      CONSTRAINT accounts_user_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_token VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL,
      expires TIMESTAMP(3) NOT NULL,
      CONSTRAINT sessions_user_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier VARCHAR(191) NOT NULL,
      token VARCHAR(191) NOT NULL,
      expires TIMESTAMP(3) NOT NULL,
      PRIMARY KEY (identifier, token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      author_id VARCHAR(191) NOT NULL,
      author_user_id VARCHAR(191) NULL,
      author_name VARCHAR(255) NOT NULL,
      author_image_url VARCHAR(2048) NULL,
      content TEXT NOT NULL,
      content_format VARCHAR(16) NOT NULL DEFAULT 'plain',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT posts_author_user_id_fk
        FOREIGN KEY (author_user_id) REFERENCES users(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      author_id VARCHAR(191) NOT NULL,
      author_user_id VARCHAR(191) NULL,
      author_name VARCHAR(255) NOT NULL,
      author_image_url VARCHAR(2048) NULL,
      content TEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT comments_post_id_fk
        FOREIGN KEY (post_id) REFERENCES posts(id)
        ON DELETE CASCADE,
      CONSTRAINT comments_author_user_id_fk
        FOREIGN KEY (author_user_id) REFERENCES users(id)
        ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumn(
    "posts",
    "author_user_id",
    "author_user_id VARCHAR(191) NULL",
  );

  await ensureColumn(
    "posts",
    "content_format",
    "content_format VARCHAR(16) NOT NULL DEFAULT 'plain'",
  );

  await ensureColumn(
    "comments",
    "author_user_id",
    "author_user_id VARCHAR(191) NULL",
  );

  // Per-user theming columns. All nullable so an unset user falls back to
  // the site owner's theme. Mirrors the 16 fields on `site_settings`.
  await ensureColumn("users", "theme", "theme VARCHAR(32) NULL");
  await ensureColumn("users", "palette", "palette VARCHAR(32) NULL");
  await ensureColumn("users", "color_background", "color_background VARCHAR(64) NULL");
  await ensureColumn("users", "color_foreground", "color_foreground VARCHAR(64) NULL");
  await ensureColumn(
    "users",
    "color_background_dark",
    "color_background_dark VARCHAR(64) NULL",
  );
  await ensureColumn(
    "users",
    "color_foreground_dark",
    "color_foreground_dark VARCHAR(64) NULL",
  );
  await ensureColumn("users", "color_primary", "color_primary VARCHAR(64) NULL");
  await ensureColumn(
    "users",
    "color_primary_foreground",
    "color_primary_foreground VARCHAR(64) NULL",
  );
  await ensureColumn("users", "color_secondary", "color_secondary VARCHAR(64) NULL");
  await ensureColumn(
    "users",
    "color_secondary_foreground",
    "color_secondary_foreground VARCHAR(64) NULL",
  );
  await ensureColumn("users", "color_accent", "color_accent VARCHAR(64) NULL");
  await ensureColumn(
    "users",
    "color_accent_foreground",
    "color_accent_foreground VARCHAR(64) NULL",
  );
  await ensureColumn("users", "color_muted", "color_muted VARCHAR(64) NULL");
  await ensureColumn(
    "users",
    "color_muted_foreground",
    "color_muted_foreground VARCHAR(64) NULL",
  );
  await ensureColumn(
    "users",
    "color_destructive",
    "color_destructive VARCHAR(64) NULL",
  );
  await ensureColumn(
    "users",
    "color_destructive_foreground",
    "color_destructive_foreground VARCHAR(64) NULL",
  );

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id INT NOT NULL PRIMARY KEY DEFAULT 1,
      theme VARCHAR(32) NOT NULL DEFAULT 'bauhaus',
      palette VARCHAR(32) NOT NULL DEFAULT 'bauhaus',
      site_title VARCHAR(255) NOT NULL,
      hero_heading VARCHAR(255) NOT NULL,
      hero_subheading TEXT NOT NULL,
      about_heading VARCHAR(255) NOT NULL,
      about_body TEXT NOT NULL,
      copyright_line VARCHAR(255) NOT NULL,
      footer_credit VARCHAR(255) NOT NULL,
      cta_label VARCHAR(255) NOT NULL,
      cta_href VARCHAR(2048) NOT NULL,
      color_background VARCHAR(64) NOT NULL,
      color_foreground VARCHAR(64) NOT NULL,
      color_background_dark VARCHAR(64) NOT NULL,
      color_foreground_dark VARCHAR(64) NOT NULL,
      color_primary VARCHAR(64) NOT NULL,
      color_primary_foreground VARCHAR(64) NOT NULL,
      color_secondary VARCHAR(64) NOT NULL,
      color_secondary_foreground VARCHAR(64) NOT NULL,
      color_accent VARCHAR(64) NOT NULL,
      color_accent_foreground VARCHAR(64) NOT NULL,
      color_muted VARCHAR(64) NOT NULL,
      color_muted_foreground VARCHAR(64) NOT NULL,
      color_destructive VARCHAR(64) NOT NULL,
      color_destructive_foreground VARCHAR(64) NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumn(
    "site_settings",
    "theme",
    "theme VARCHAR(32) NOT NULL DEFAULT 'bauhaus'",
  );

  await ensureColumn(
    "site_settings",
    "palette",
    "palette VARCHAR(32) NOT NULL DEFAULT 'bauhaus'",
  );

  await mysqlPool.query(
    `
    INSERT IGNORE INTO site_settings (
      id, theme, palette,
      site_title, hero_heading, hero_subheading, about_heading, about_body,
      copyright_line, footer_credit, cta_label, cta_href,
      color_background, color_foreground, color_background_dark, color_foreground_dark,
      color_primary, color_primary_foreground,
      color_secondary, color_secondary_foreground,
      color_accent, color_accent_foreground,
      color_muted, color_muted_foreground,
      color_destructive, color_destructive_foreground
    ) VALUES (
      1, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    `,
    [
      "bauhaus",
      "bauhaus",
      "Chris Fornesa",
      "Buenas at Kumusta!",
      "Welcome to my digital garden where I cultivate my thoughts, feelings, hopes, dreams, and more.",
      "About This Platform",
      "A space where I share my thoughts, ideas, and experiences with the world. Built with React using Replit, Claude Code, Codex, and Gemini CLI.",
      "Chris Fornesa",
      "Built with React using Replit, Claude Code, Codex, and Gemini CLI.",
      "Learn More About Me",
      "/users/@cfornesa",
      "0 0% 100%",
      "0 0% 0%",
      "0 0% 0%",
      "0 0% 100%",
      "0 100% 50%",
      "0 0% 100%",
      "240 100% 50%",
      "0 0% 100%",
      "60 100% 50%",
      "0 0% 0%",
      "60 100% 50%",
      "0 0% 0%",
      "0 100% 50%",
      "0 0% 100%",
    ],
  );

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS reactions (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      user_id VARCHAR(191) NOT NULL,
      type VARCHAR(32) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT reactions_post_id_fk
        FOREIGN KEY (post_id) REFERENCES posts(id)
        ON DELETE CASCADE,
      CONSTRAINT reactions_user_id_fk
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      UNIQUE KEY reactions_post_user_type_unique (post_id, user_id, type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
