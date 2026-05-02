import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type { RowDataPacket } from "mysql2/promise";
import {
  db,
  ensureTables,
  mysqlPool,
  usersTable,
  accountsTable,
  sessionsTable,
  verificationTokensTable,
  postsTable,
  commentsTable,
  reactionsTable,
} from "@workspace/db";

type SqliteUserRow = {
  id: string;
  name: string | null;
  email: string | null;
  email_verified: number | null;
  image: string | null;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  post_count: number;
};

type SqliteAccountRow = {
  user_id: string;
  type: string;
  provider: string;
  provider_account_id: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  session_state: string | null;
};

type SqliteSessionRow = {
  session_token: string;
  user_id: string;
  expires: number;
};

type SqliteVerificationTokenRow = {
  identifier: string;
  token: string;
  expires: number;
};

type SqlitePostRow = {
  id: number;
  author_id: string;
  author_user_id: string | null;
  author_name: string;
  author_image_url: string | null;
  content: string;
  content_format: string;
  created_at: string;
};

type SqliteCommentRow = {
  id: number;
  post_id: number;
  author_id: string;
  author_user_id: string | null;
  author_name: string;
  author_image_url: string | null;
  content: string;
  created_at: string;
};

type SqliteReactionRow = {
  id: number;
  post_id: number;
  user_id: string;
  type: string;
  created_at: string;
};

const TABLES = [
  "users",
  "accounts",
  "sessions",
  "verification_tokens",
  "posts",
  "comments",
  "reactions",
] as const;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function getSqlitePath(): string {
  const configuredPath = process.env.SQLITE_IMPORT_PATH?.trim() || "data/microblog.db";
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(repoRoot, configuredPath);
}

function normalizeDateTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 23).replace("T", " ");
  }

  const normalized = value.replace("T", " ").replace("Z", "");
  if (normalized.length === 19) {
    return `${normalized}.000`;
  }

  return normalized.slice(0, 23);
}

function normalizeTimestampMs(value: number | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid timestamp value encountered during import: ${value}`);
  }

  return parsed;
}

async function querySqlite<T extends Record<string, unknown>>(client: ReturnType<typeof createClient>, sql: string): Promise<T[]> {
  const result = await client.execute(sql);
  return result.rows.map((row) => ({ ...row })) as unknown as T[];
}

async function assertMysqlEmpty(): Promise<void> {
  for (const table of TABLES) {
    const [rows] = await mysqlPool.query<Array<RowDataPacket & { count: number }>>(
      `SELECT COUNT(*) AS count FROM \`${table}\``,
    );

    if ((rows[0]?.count ?? 0) > 0) {
      throw new Error(
        `MySQL table "${table}" already contains data. Refusing to import into a non-empty database.`,
      );
    }
  }
}

async function insertInBatches<T>(rows: T[], insertBatch: (batch: T[]) => Promise<void>): Promise<void> {
  const batchSize = 100;
  for (let index = 0; index < rows.length; index += batchSize) {
    await insertBatch(rows.slice(index, index + batchSize));
  }
}

async function main() {
  const sqlitePath = getSqlitePath();
  const sqliteClient = createClient({ url: `file:${sqlitePath}` });

  await ensureTables();
  await assertMysqlEmpty();

  const users = await querySqlite<SqliteUserRow>(sqliteClient, "SELECT * FROM users ORDER BY id");
  const accounts = await querySqlite<SqliteAccountRow>(sqliteClient, "SELECT * FROM accounts ORDER BY provider, provider_account_id");
  const sessions = await querySqlite<SqliteSessionRow>(sqliteClient, "SELECT * FROM sessions ORDER BY session_token");
  const verificationTokens = await querySqlite<SqliteVerificationTokenRow>(sqliteClient, "SELECT * FROM verification_tokens ORDER BY identifier, token");
  const posts = await querySqlite<SqlitePostRow>(sqliteClient, "SELECT * FROM posts ORDER BY id");
  const comments = await querySqlite<SqliteCommentRow>(sqliteClient, "SELECT * FROM comments ORDER BY id");
  const reactions = await querySqlite<SqliteReactionRow>(sqliteClient, "SELECT * FROM reactions ORDER BY id");

  await db.transaction(async (tx) => {
    await insertInBatches(users, async (batch) => {
      await tx.insert(usersTable).values(
        batch.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          emailVerified: normalizeTimestampMs(row.email_verified),
          image: row.image,
          role: row.role,
          status: row.status,
          createdAt: normalizeDateTime(row.created_at)!,
          updatedAt: normalizeDateTime(row.updated_at)!,
          lastLoginAt: normalizeDateTime(row.last_login_at),
          postCount: row.post_count,
        })),
      );
    });

    await insertInBatches(accounts, async (batch) => {
      await tx.insert(accountsTable).values(
        batch.map((row) => ({
          userId: row.user_id,
          type: row.type,
          provider: row.provider,
          providerAccountId: row.provider_account_id,
          refresh_token: row.refresh_token,
          access_token: row.access_token,
          expires_at: row.expires_at,
          token_type: row.token_type,
          scope: row.scope,
          id_token: row.id_token,
          session_state: row.session_state,
        })),
      );
    });

    await insertInBatches(sessions, async (batch) => {
      await tx.insert(sessionsTable).values(
        batch.map((row) => ({
          sessionToken: row.session_token,
          userId: row.user_id,
          expires: normalizeTimestampMs(row.expires)!,
        })),
      );
    });

    await insertInBatches(verificationTokens, async (batch) => {
      await tx.insert(verificationTokensTable).values(
        batch.map((row) => ({
          identifier: row.identifier,
          token: row.token,
          expires: normalizeTimestampMs(row.expires)!,
        })),
      );
    });

    await insertInBatches(posts, async (batch) => {
      await tx.insert(postsTable).values(
        batch.map((row) => ({
          id: row.id,
          authorId: row.author_id,
          authorUserId: row.author_user_id,
          authorName: row.author_name,
          authorImageUrl: row.author_image_url,
          content: row.content,
          contentFormat: row.content_format,
          createdAt: normalizeDateTime(row.created_at)!,
        })),
      );
    });

    await insertInBatches(comments, async (batch) => {
      await tx.insert(commentsTable).values(
        batch.map((row) => ({
          id: row.id,
          postId: row.post_id,
          authorId: row.author_id,
          authorUserId: row.author_user_id,
          authorName: row.author_name,
          authorImageUrl: row.author_image_url,
          content: row.content,
          createdAt: normalizeDateTime(row.created_at)!,
        })),
      );
    });

    await insertInBatches(reactions, async (batch) => {
      await tx.insert(reactionsTable).values(
        batch.map((row) => ({
          id: row.id,
          postId: row.post_id,
          userId: row.user_id,
          type: row.type,
          createdAt: normalizeDateTime(row.created_at)!,
        })),
      );
    });
  });

  console.log(`Imported SQLite data from ${sqlitePath} into MySQL.`);
  console.log(
    [
      `users=${users.length}`,
      `accounts=${accounts.length}`,
      `sessions=${sessions.length}`,
      `verification_tokens=${verificationTokens.length}`,
      `posts=${posts.length}`,
      `comments=${comments.length}`,
      `reactions=${reactions.length}`,
    ].join(" | "),
  );

  await sqliteClient.close();
  await mysqlPool.end();
}

main().catch(async (error) => {
  console.error(error);
  await mysqlPool.end().catch(() => {});
  process.exit(1);
});
