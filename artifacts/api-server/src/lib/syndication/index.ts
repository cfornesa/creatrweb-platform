import {
  db,
  platformConnectionsTable,
  postSyndicationsTable,
  postsTable,
  eq,
  and,
  inArray,
  formatMysqlDateTime,
  type PlatformConnection,
  type Post,
} from "@workspace/db";
import { encryptSecret } from "../crypto";
import { logger } from "../logger";
import type {
  PlatformAdapter,
  SyndicationDispatchOptions,
  SyndicationPayload,
  TokenRefreshResult,
} from "./types";
import { wordpressComAdapter } from "./wordpress-com";
import { wordpressSelfAdapter } from "./wordpress-self";
import { mediumAdapter } from "./medium";
import { bloggerAdapter } from "./blogger";
import { substackAdapter } from "./substack";

const ADAPTERS: Record<string, PlatformAdapter> = {
  wordpress_com: wordpressComAdapter,
  wordpress_self: wordpressSelfAdapter,
  medium: mediumAdapter,
  blogger: bloggerAdapter,
  substack: substackAdapter,
};

export function getAdapter(platform: string): PlatformAdapter {
  const adapter = ADAPTERS[platform];
  if (!adapter) throw new Error(`No syndication adapter for platform: ${platform}`);
  return adapter;
}

function buildPayload(post: Post, origin: string): SyndicationPayload {
  return {
    title: (post as Post & { title?: string | null }).title?.trim() ?? "",
    contentHtml: post.content,
    canonicalUrl: `${origin}/posts/${post.id}`,
  };
}

// Refresh the connection token if it expires within 5 minutes.
// Returns the updated connection row (with still-encrypted token fields).
async function maybeRefreshToken(
  connection: PlatformConnection,
  adapter: PlatformAdapter,
): Promise<PlatformConnection> {
  if (!adapter.refreshToken || !connection.expiresAt) return connection;

  const expiresMs = new Date(connection.expiresAt).getTime();
  const fiveMinutesMs = 5 * 60 * 1000;
  if (Date.now() < expiresMs - fiveMinutesMs) return connection;

  logger.info({ connectionId: connection.id, platform: connection.platform }, "Refreshing platform token");

  let refreshed: TokenRefreshResult;
  try {
    refreshed = await adapter.refreshToken(connection);
  } catch (err) {
    logger.warn({ err, connectionId: connection.id }, "Token refresh failed — proceeding with stale token");
    return connection;
  }

  const now = formatMysqlDateTime(new Date());
  const expiresAt = refreshed.expiresAt
    ? formatMysqlDateTime(new Date(refreshed.expiresAt))
    : null;

  const patch: Partial<typeof platformConnectionsTable.$inferInsert> = {
    encryptedAccessToken: encryptSecret(refreshed.accessToken),
    updatedAt: now,
  };
  if (expiresAt) patch.expiresAt = expiresAt;
  if (refreshed.refreshToken) patch.encryptedRefreshToken = encryptSecret(refreshed.refreshToken);

  await db
    .update(platformConnectionsTable)
    .set(patch)
    .where(eq(platformConnectionsTable.id, connection.id));

  return { ...connection, ...patch, expiresAt: expiresAt ?? connection.expiresAt };
}

async function runSyndication(
  postId: number,
  connectionIds: number[],
  userId: string,
  origin: string,
  options: SyndicationDispatchOptions,
): Promise<void> {
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, postId))
    .limit(1);

  if (!post) {
    logger.warn({ postId }, "Syndication skipped — post not found");
    return;
  }

  const connections = await db
    .select()
    .from(platformConnectionsTable)
    .where(
      and(
        inArray(platformConnectionsTable.id, connectionIds),
        eq(platformConnectionsTable.userId, userId),
        eq(platformConnectionsTable.enabled, 1),
      ),
    );

  if (connections.length === 0) return;

  const payload = buildPayload(post, origin);

  for (const conn of connections) {
    // Insert a pending row first; idempotent via ON DUPLICATE KEY UPDATE.
    await db
      .insert(postSyndicationsTable)
      .values({ postId, platformConnectionId: conn.id, status: "pending" })
      .onDuplicateKeyUpdate({ set: { status: "pending" } });

    try {
      const adapter = getAdapter(conn.platform);
      const refreshedConn = await maybeRefreshToken(conn, adapter);
      const result = await adapter.publish(refreshedConn, payload, options);

      await db
        .update(postSyndicationsTable)
        .set({
          status: "success",
          externalId: result.externalId,
          externalUrl: result.externalUrl,
          syncedAt: formatMysqlDateTime(new Date()),
        })
        .where(
          and(
            eq(postSyndicationsTable.postId, postId),
            eq(postSyndicationsTable.platformConnectionId, conn.id),
          ),
        );

      logger.info(
        { postId, platform: conn.platform, externalUrl: result.externalUrl },
        "Post syndicated",
      );
    } catch (err) {
      const errorMessage = String(err).slice(0, 1000);
      await db
        .update(postSyndicationsTable)
        .set({ status: "failed", errorMessage })
        .where(
          and(
            eq(postSyndicationsTable.postId, postId),
            eq(postSyndicationsTable.platformConnectionId, conn.id),
          ),
        );

      logger.warn({ err, postId, platform: conn.platform }, "Syndication failed for platform");
    }
  }
}

/**
 * Fire-and-forget: dispatches syndication after post creation.
 * Runs asynchronously so it never delays the POST /posts response.
 */
export function enqueueSyndication(
  postId: number,
  connectionIds: number[],
  userId: string,
  origin: string,
  options: SyndicationDispatchOptions = {},
): void {
  if (connectionIds.length === 0) return;
  void Promise.resolve()
    .then(() => runSyndication(postId, connectionIds, userId, origin, options))
    .catch((err) => logger.error({ err, postId }, "Syndication dispatcher threw unexpectedly"));
}
