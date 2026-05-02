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
