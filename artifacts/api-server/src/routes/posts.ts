import { Router, type IRouter, type Request, type Response } from "express";
import { db, mysqlPool, postsTable, commentsTable, feedSourcesTable, eq, desc, count, and } from "@workspace/db";
import {
  CreatePostBody,
  ListPostsQueryParams,
  GetPostParams,
  DeletePostParams,
  UpdatePostBody,
  GetPostsByUserParams,
  GetPostsByUserQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireOwner } from "../middlewares/auth";
import { sanitizeRichHtml, computeContentText } from "../lib/html";
import { generatePostOgImage } from "../lib/og";
import { loadCurrentUser } from "../lib/current-user";
import { isPostVisibleToReader } from "../lib/post-visibility";
import {
  buildSearchSnippet,
  parseSearchQuery,
  type SearchQuery,
} from "../lib/post-search";
import type { RowDataPacket } from "mysql2/promise";

const router: IRouter = Router();

// GET /og/posts/:id — generate dynamic OG image
router.get("/og/posts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = GetPostParams.parse(req.params);

    const post = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    if (!post[0]) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post[0].status === "pending") {
      const { user } = await loadCurrentUser(req);
      if (!isPostVisibleToReader(post[0].status, user)) {
        return res.status(404).json({ error: "Post not found" });
      }
    }

    const pngBuffer = await generatePostOgImage({
      content: post[0].content,
      authorName: post[0].authorName,
      authorImageUrl: post[0].authorImageUrl,
      createdAt: post[0].createdAt,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours
    return res.send(pngBuffer);
  } catch (err) {
    console.error("OG Image generation failed:", err);
    return res.status(500).json({ error: "Failed to generate image" });
  }
});

// GET /feed/stats — must be registered before parameterized routes
router.get("/feed/stats", async (_req: Request, res: Response) => {
  try {
    const totalPostsResult = await db.select({ count: count() }).from(postsTable);
    const totalCommentsResult = await db.select({ count: count() }).from(commentsTable);

    return res.json({
      totalPosts: totalPostsResult[0]?.count ?? 0,
      totalComments: totalCommentsResult[0]?.count ?? 0,
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /posts/user/:userId — must be registered before /posts/:id
router.get("/posts/user/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = GetPostsByUserParams.parse(req.params);
    const query = GetPostsByUserQueryParams.parse(req.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const posts = await db
      .select({
        id: postsTable.id,
        authorId: postsTable.authorId,
        authorName: postsTable.authorName,
        authorImageUrl: postsTable.authorImageUrl,
        content: postsTable.content,
        contentFormat: postsTable.contentFormat,
        sourceFeedId: postsTable.sourceFeedId,
        sourceFeedName: feedSourcesTable.name,
        sourceCanonicalUrl: postsTable.sourceCanonicalUrl,
        createdAt: postsTable.createdAt,
        commentCount: count(commentsTable.id),
      })
      .from(postsTable)
      .leftJoin(commentsTable, eq(commentsTable.postId, postsTable.id))
      .leftJoin(feedSourcesTable, eq(feedSourcesTable.id, postsTable.sourceFeedId))
      .where(and(eq(postsTable.authorId, userId), eq(postsTable.status, "published")))
      .groupBy(postsTable.id)
      .orderBy(desc(postsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: count() })
      .from(postsTable)
      .where(and(eq(postsTable.authorId, userId), eq(postsTable.status, "published")));
    const total = totalResult[0]?.count ?? 0;

    return res.json({ posts, total, page, limit });
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// GET /posts/search — relevance-ranked + filtered post search.
//
// Always restricted to `status = 'published'` — search is semantically
// "what's publicly visible," even for the owner. Pending feed-imports
// only surface in the moderation queue.
//
// Filters round-trip in the URL so /search?... is shareable. The
// endpoint is the only place that does highlighting so the client just
// renders the (server-sanitized) `<mark>...</mark>` snippet.
router.get("/posts/search", async (req: Request, res: Response) => {
  try {
    const rawQ = typeof req.query.q === "string" ? req.query.q : "";
    const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
    const rawTo = typeof req.query.to === "string" ? req.query.to : "";
    const rawSources = typeof req.query.sources === "string" ? req.query.sources : "";
    const rawAuthor = typeof req.query.author === "string" ? req.query.author : "";
    const rawFormat = typeof req.query.format === "string" ? req.query.format : "";
    const rawPage = typeof req.query.page === "string" ? req.query.page : "1";
    const rawLimit = typeof req.query.limit === "string" ? req.query.limit : "20";

    const page = Math.max(1, Number.parseInt(rawPage, 10) || 1);
    // Cap `limit` to keep result-set size bounded; the UI never needs
    // more than 50 cards per page.
    const limit = Math.min(50, Math.max(1, Number.parseInt(rawLimit, 10) || 20));
    const offset = (page - 1) * limit;

    const search: SearchQuery | null = parseSearchQuery(rawQ);

    // WHERE clause built up as parameterized fragments. We use raw SQL
    // because Drizzle's query builder doesn't have a `MATCH ... AGAINST`
    // primitive and we want a single round-trip with the FULLTEXT
    // expression both in SELECT (for the score) and in WHERE.
    const whereParts: string[] = ["p.status = ?"];
    const whereParams: unknown[] = ["published"];

    if (search) {
      whereParts.push("MATCH(p.content_text) AGAINST(? IN BOOLEAN MODE)");
      whereParams.push(search.booleanExpression);
    }

    if (rawFrom) {
      const fromDate = new Date(rawFrom);
      if (!Number.isNaN(fromDate.getTime())) {
        whereParts.push("p.created_at >= ?");
        whereParams.push(fromDate.toISOString().slice(0, 19).replace("T", " "));
      }
    }
    if (rawTo) {
      const toDate = new Date(rawTo);
      if (!Number.isNaN(toDate.getTime())) {
        // Inclusive upper bound: bump by one day so `to=2026-01-01`
        // includes everything published on Jan 1.
        const inclusive = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
        whereParts.push("p.created_at < ?");
        whereParams.push(inclusive.toISOString().slice(0, 19).replace("T", " "));
      }
    }

    if (rawSources) {
      const tokens = rawSources
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const sourceIds: number[] = [];
      let includeNative = false;
      for (const token of tokens) {
        if (token === "native") {
          includeNative = true;
          continue;
        }
        const n = Number.parseInt(token, 10);
        if (Number.isFinite(n) && n > 0) {
          sourceIds.push(n);
        }
      }
      // Only narrow when at least one usable token survived parsing —
      // an all-junk `sources=` should behave like no filter, not an
      // impossible `WHERE FALSE`.
      if (includeNative || sourceIds.length > 0) {
        const orParts: string[] = [];
        if (includeNative) {
          orParts.push("p.source_feed_id IS NULL");
        }
        if (sourceIds.length > 0) {
          orParts.push(
            `p.source_feed_id IN (${sourceIds.map(() => "?").join(",")})`,
          );
          whereParams.push(...sourceIds);
        }
        whereParts.push(`(${orParts.join(" OR ")})`);
      }
    }

    if (rawAuthor) {
      // Case-insensitive substring; `LOWER(...) LIKE LOWER(?)` is
      // portable and the post volume here doesn't justify a generated
      // column for it.
      whereParts.push("LOWER(p.author_name) LIKE LOWER(?)");
      whereParams.push(`%${rawAuthor}%`);
    }

    if (rawFormat) {
      const formats = rawFormat
        .split(",")
        .map((f) => f.trim().toLowerCase())
        .filter((f) => f === "html" || f === "plain");
      // `formats=html,plain` is identical to no filter — skip the
      // predicate so the query planner doesn't waste its time.
      if (formats.length === 1) {
        whereParts.push("p.content_format = ?");
        whereParams.push(formats[0]);
      }
    }

    const whereSql = whereParts.join(" AND ");

    // Score column only when we have a query; otherwise fall back to
    // recency. Two SELECTs to keep the no-query path from carrying a
    // useless 0.0 score.
    const selectScore = search
      ? ", MATCH(p.content_text) AGAINST(? IN BOOLEAN MODE) AS score"
      : "";
    const orderBy = search
      ? "ORDER BY score DESC, p.created_at DESC"
      : "ORDER BY p.created_at DESC";

    const queryParams: unknown[] = [];
    if (search) queryParams.push(search.booleanExpression);
    queryParams.push(...whereParams, limit, offset);

    const sqlText = `
      SELECT
        p.id              AS id,
        p.author_id       AS authorId,
        p.author_name     AS authorName,
        p.author_image_url AS authorImageUrl,
        p.content         AS content,
        p.content_text    AS contentText,
        p.content_format  AS contentFormat,
        p.source_feed_id  AS sourceFeedId,
        fs.name           AS sourceFeedName,
        p.source_canonical_url AS sourceCanonicalUrl,
        p.created_at      AS createdAt,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentCount
        ${selectScore}
      FROM posts p
      LEFT JOIN feed_sources fs ON fs.id = p.source_feed_id
      WHERE ${whereSql}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await mysqlPool.query<RowDataPacket[]>(sqlText, queryParams);

    const totalSql = `SELECT COUNT(*) AS total FROM posts p WHERE ${whereSql}`;
    const [totalRows] = await mysqlPool.query<RowDataPacket[]>(totalSql, whereParams);
    const total = Number(totalRows[0]?.total ?? 0);

    const terms = search?.terms ?? [];
    const posts = rows.map((row) => {
      const snippet = buildSearchSnippet(row.contentText as string | null, terms);
      const result: Record<string, unknown> = {
        id: row.id,
        authorId: row.authorId,
        authorName: row.authorName,
        authorImageUrl: row.authorImageUrl,
        content: row.content,
        contentFormat: row.contentFormat,
        commentCount: Number(row.commentCount ?? 0),
        sourceFeedId: row.sourceFeedId,
        sourceFeedName: row.sourceFeedName,
        sourceCanonicalUrl: row.sourceCanonicalUrl,
        createdAt: row.createdAt,
        snippet,
      };
      if (search && row.score !== undefined) {
        result.score = Number(row.score);
      }
      return result;
    });

    return res.json({ posts, total, page, limit, query: rawQ });
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// GET /posts — list paginated posts
router.get("/posts", async (req: Request, res: Response) => {
  try {
    const query = ListPostsQueryParams.parse(req.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    const posts = await db
      .select({
        id: postsTable.id,
        authorId: postsTable.authorId,
        authorName: postsTable.authorName,
        authorImageUrl: postsTable.authorImageUrl,
        content: postsTable.content,
        contentFormat: postsTable.contentFormat,
        sourceFeedId: postsTable.sourceFeedId,
        sourceFeedName: feedSourcesTable.name,
        sourceCanonicalUrl: postsTable.sourceCanonicalUrl,
        createdAt: postsTable.createdAt,
        commentCount: count(commentsTable.id),
      })
      .from(postsTable)
      .leftJoin(commentsTable, eq(commentsTable.postId, postsTable.id))
      .leftJoin(feedSourcesTable, eq(feedSourcesTable.id, postsTable.sourceFeedId))
      .where(eq(postsTable.status, "published"))
      .groupBy(postsTable.id)
      .orderBy(desc(postsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.status, "published"));
    const total = totalResult[0]?.count ?? 0;

    return res.json({ posts, total, page, limit });
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// POST /posts — create a post
router.post("/posts", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const body = CreatePostBody.parse(req.body);
    const currentUser = req.currentUser!;
    const authorName = currentUser.name || currentUser.email || "Anonymous";
    const normalizedContent =
      body.contentFormat === "html" ? sanitizeRichHtml(body.content) : body.content.trim();

    const insertResult = await db
      .insert(postsTable)
      .values({
        authorId: currentUser.id,
        authorUserId: currentUser.id,
        authorName,
        authorImageUrl: currentUser.image,
        content: normalizedContent,
        // Shadow column for FULLTEXT search; derived from the same
        // normalized body so search hits the words a reader actually
        // sees instead of raw HTML tags.
        contentText: computeContentText(normalizedContent, body.contentFormat),
        contentFormat: body.contentFormat,
        createdAt: new Date().toISOString(),
      })
      .$returningId();

    const insertedId = insertResult[0]?.id;
    if (!insertedId) {
      return res.status(500).json({ error: "Failed to create post" });
    }

    const post = await db.select().from(postsTable).where(eq(postsTable.id, insertedId)).limit(1);
    if (!post[0]) {
      return res.status(500).json({ error: "Failed to load created post" });
    }

    return res.status(201).json({ ...post[0], commentCount: 0 });
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// GET /posts/:id — get post with comments
router.get("/posts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = GetPostParams.parse(req.params);

    const postRows = await db
      .select({
        id: postsTable.id,
        authorId: postsTable.authorId,
        authorName: postsTable.authorName,
        authorImageUrl: postsTable.authorImageUrl,
        content: postsTable.content,
        contentFormat: postsTable.contentFormat,
        status: postsTable.status,
        sourceFeedId: postsTable.sourceFeedId,
        sourceFeedName: feedSourcesTable.name,
        sourceCanonicalUrl: postsTable.sourceCanonicalUrl,
        createdAt: postsTable.createdAt,
        commentCount: count(commentsTable.id),
      })
      .from(postsTable)
      .leftJoin(commentsTable, eq(commentsTable.postId, postsTable.id))
      .leftJoin(feedSourcesTable, eq(feedSourcesTable.id, postsTable.sourceFeedId))
      .where(eq(postsTable.id, id))
      .groupBy(postsTable.id);

    const post = postRows[0];
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    if (post.status === "pending") {
      const { user } = await loadCurrentUser(req);
      if (!isPostVisibleToReader(post.status, user)) {
        return res.status(404).json({ error: "Post not found" });
      }
    }

    const comments = await db
      .select()
      .from(commentsTable)
      .where(eq(commentsTable.postId, id))
      .orderBy(desc(commentsTable.createdAt));

    return res.json({ post, comments });
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// PATCH /posts/:id — update owner-authored post
router.patch("/posts/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const { id } = GetPostParams.parse(req.params);
    const body = UpdatePostBody.parse(req.body);
    const normalizedContent =
      body.contentFormat === "html" ? sanitizeRichHtml(body.content) : body.content.trim();

    const post = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    if (!post[0]) {
      return res.status(404).json({ error: "Post not found" });
    }
    if (post[0].authorUserId && post[0].authorUserId !== req.currentUser!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await db
      .update(postsTable)
      .set({
        content: normalizedContent,
        // Recompute the search shadow column in the same statement so
        // `posts.content` and `posts.content_text` cannot drift.
        contentText: computeContentText(normalizedContent, body.contentFormat),
        contentFormat: body.contentFormat,
      })
      .where(eq(postsTable.id, id));

    const updatedPost = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    if (!updatedPost[0]) {
      return res.status(500).json({ error: "Failed to load updated post" });
    }

    const commentCountResult = await db
      .select({ count: count(commentsTable.id) })
      .from(commentsTable)
      .where(eq(commentsTable.postId, id));

    return res.json({
      ...updatedPost[0],
      commentCount: commentCountResult[0]?.count ?? 0,
    });
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// DELETE /posts/:id — delete owner-authored post
router.delete("/posts/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const { id } = DeletePostParams.parse(req.params);

    const post = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    if (!post[0]) {
      return res.status(404).json({ error: "Post not found" });
    }
    if (post[0].authorUserId && post[0].authorUserId !== req.currentUser!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await db.delete(postsTable).where(eq(postsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

export default router;
