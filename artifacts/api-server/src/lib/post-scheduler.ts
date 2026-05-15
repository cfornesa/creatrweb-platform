import { db, postsTable, eq, and, lte, formatMysqlDateTimeUtc, formatMysqlDateTime } from "@workspace/db";
import { enqueueSyndication } from "./syndication/index";

const SCHEDULER_INTERVAL_MS = 60_000;

function resolveOrigin(): string {
  const siteUrl = process.env.PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (siteUrl) return siteUrl.replace(/\/$/, "");
  const port = process.env.PORT || "4000";
  return `http://localhost:${port}`;
}

// Publish any scheduled posts whose scheduledAt has passed.
async function publishDuePosts(): Promise<void> {
  const nowStr = formatMysqlDateTimeUtc();

  const duePosts = await db
    .select({
      id: postsTable.id,
      authorUserId: postsTable.authorUserId,
      pendingPlatformIds: postsTable.pendingPlatformIds,
    })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "scheduled"),
        lte(postsTable.scheduledAt, nowStr),
      ),
    );

  if (duePosts.length === 0) return;

  const origin = resolveOrigin();
  for (const post of duePosts) {
    try {
      const publishedAt = formatMysqlDateTime();
      await db
        .update(postsTable)
        .set({ status: "published", scheduledAt: null, pendingPlatformIds: null, createdAt: publishedAt })
        .where(eq(postsTable.id, post.id));

      const platformIds: number[] =
        post.pendingPlatformIds ? (JSON.parse(post.pendingPlatformIds) as number[]) : [];
      if (post.authorUserId && platformIds.length > 0) {
        enqueueSyndication(post.id, platformIds, post.authorUserId, origin, {
          substackSendNewsletter: false,
        });
      }

      console.log(`[scheduler] Published scheduled post #${post.id}`);
    } catch (err) {
      console.error(`[scheduler] Failed to publish post #${post.id}:`, err);
    }
  }
}

export function startPostScheduler(): void {
  setInterval(() => {
    publishDuePosts().catch((err) => {
      console.error("[scheduler] Unexpected error in publishDuePosts:", err);
    });
  }, SCHEDULER_INTERVAL_MS);
}
