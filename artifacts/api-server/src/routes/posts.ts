import { Router, type IRouter, type Request, type Response } from "express";
import { db, mysqlPool, postsTable, commentsTable, feedSourcesTable, categoriesTable, postCategoriesTable, eq, desc, count, and, isNull, inArray, notExists, sql, formatMysqlDateTime } from "@workspace/db";
import {
  attachCategoriesToPosts,
  hydratePostCategories,
  replacePostCategories,
  validateCategoryIds,
  resolveCategorySlugsToIds,
} from "../lib/post-categories";
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
  validateSearchInput,
  MAX_SEARCH_QUERY_LENGTH,
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

    const hydrated = await attachCategoriesToPosts(posts);
    return res.json({ posts: hydrated, total, page, limit });
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
  // Two-tier input handling:
  //   - Strict for `page` / `limit` / `format`: malformed values get a
  //     400 with the offending field, because they're almost always a
  //     client bug or a tampered URL we want surfaced.
  //   - Permissive for filters that just narrow the result set
  //     (`from`, `to`, `sources`, `author`): garbage collapses to "no
  //     filter," because there's no useful 400 to return for a
  //     misspelled date range.
  // Anything that throws below the validation gate is a server-side
  // fault — the catch returns 500 so the client knows it's safe to
  // retry rather than to "fix" their query.
  const validated = validateSearchInput(req.query);
  if (!validated.ok) {
    return res.status(400).json({
      error: validated.error.message,
      field: validated.error.field,
    });
  }
  const { page, limit, formats } = validated.value;
  const offset = (page - 1) * limit;

  // Clamp `q` up front: the parser also truncates defensively, but
  // bounding it here keeps the JSON echo (`query: rawQ` below) and the
  // error log payload from carrying a multi-megabyte string back out.
  const rawQRaw = typeof req.query.q === "string" ? req.query.q : "";
  const rawQ =
    rawQRaw.length > MAX_SEARCH_QUERY_LENGTH
      ? rawQRaw.slice(0, MAX_SEARCH_QUERY_LENGTH)
      : rawQRaw;
  const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
  const rawTo = typeof req.query.to === "string" ? req.query.to : "";
  const rawSources = typeof req.query.sources === "string" ? req.query.sources : "";
  const rawCategories = typeof req.query.categories === "string" ? req.query.categories : "";
  const rawAuthor = typeof req.query.author === "string" ? req.query.author : "";

  const search: SearchQuery | null = parseSearchQuery(rawQ);

  try {
    // WHERE clause built up as parameterized fragments. We use raw SQL
    // because Drizzle's query builder doesn't have a `MATCH ... AGAINST`
    // primitive and we want a single round-trip with the FULLTEXT
    // expression both in SELECT (for the score) and in WHERE.
    const whereParts: string[] = ["p.status = ?"];
    const whereParams: unknown[] = ["published"];

    if (search) {
      // Compose the q-predicate as an OR of the FULLTEXT branch and
      // any short-token LIKE branches. Either may be absent: a query
      // like `js` is LIKE-only, a query like `react` is FULLTEXT-only,
      // and `js react` is both. The boolean-mode expression already
      // carries the per-token `+` so phrases and unquoted words are
      // required from inside MATCH; the LIKE branches stay OR'd to
      // preserve the existing short-token findability behavior.
      const orParts: string[] = [];
      if (search.booleanExpression) {
        orParts.push("MATCH(p.content_text) AGAINST(? IN BOOLEAN MODE)");
        whereParams.push(search.booleanExpression);
      }
      for (const term of search.likeTerms) {
        orParts.push("LOWER(p.content_text) LIKE LOWER(?)");
        whereParams.push(`%${term}%`);
      }
      // `parseSearchQuery` guarantees orParts is non-empty whenever
      // it returns a non-null result, so the wrap is always safe.
      whereParts.push(`(${orParts.join(" OR ")})`);
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

    if (rawCategories) {
      // Resolve slugs → ids permissively (mirrors `sources`): an
      // all-junk filter collapses to "no narrow" rather than `WHERE FALSE`.
      const ids = await resolveCategorySlugsToIds(rawCategories);
      if (ids && ids.length > 0) {
        whereParts.push(
          `p.id IN (SELECT pc.post_id FROM post_categories pc WHERE pc.category_id IN (${ids
            .map(() => "?")
            .join(",")}))`,
        );
        whereParams.push(...ids);
      }
    }

    if (rawAuthor) {
      // Case-insensitive substring; `LOWER(...) LIKE LOWER(?)` is
      // portable and the post volume here doesn't justify a generated
      // column for it.
      whereParts.push("LOWER(p.author_name) LIKE LOWER(?)");
      whereParams.push(`%${rawAuthor}%`);
    }

    // `formats` was already normalized by validateSearchInput: it's
    // either null (no filter) or a single-element list. The "both
    // formats checked" case collapses to null in the validator, so
    // the route doesn't waste a predicate on it.
    if (formats && formats.length === 1) {
      whereParts.push("p.content_format = ?");
      whereParams.push(formats[0]);
    }

    const whereSql = whereParts.join(" AND ");

    // Score column only when we have a FULLTEXT branch to score
    // against; LIKE-only searches sort by recency so the result set
    // is at least stable.
    const hasFulltext = !!search?.booleanExpression;
    const selectScore = hasFulltext
      ? ", MATCH(p.content_text) AGAINST(? IN BOOLEAN MODE) AS score"
      : "";
    const orderBy = hasFulltext
      ? "ORDER BY score DESC, p.created_at DESC"
      : "ORDER BY p.created_at DESC";

    const queryParams: unknown[] = [];
    if (hasFulltext) queryParams.push(search!.booleanExpression);
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
    const ids = rows.map((r) => Number(r.id));
    const categoriesMap = await hydratePostCategories(ids);
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
        categories: categoriesMap.get(Number(row.id)) ?? [],
        createdAt: row.createdAt,
        snippet,
      };
      if (hasFulltext && row.score !== undefined) {
        result.score = Number(row.score);
      }
      return result;
    });

    return res.json({ posts, total, page, limit, query: rawQ });
  } catch (err) {
    // We've already validated/normalized inputs above, so anything
    // that throws here is a server-side fault (DB outage, malformed
    // SQL after a refactor, etc.). Log with the request id so we can
    // correlate with `pino-http` access logs, and return 5xx so the
    // client knows it's safe to retry rather than to "fix" their
    // query.
    req.log?.error(
      { err, q: rawQ, page, limit },
      "GET /api/posts/search failed",
    );
    return res.status(500).json({ error: "Search failed" });
  }
});

// GET /posts — list paginated posts
router.get("/posts", async (req: Request, res: Response) => {
  try {
    const query = ListPostsQueryParams.parse(req.query);
    const { page, limit } = query;
    const offset = (page - 1) * limit;

    // Build filter conditions — start with the mandatory status check.
    type Condition = Parameters<typeof and>[0];
    const conditions: Condition[] = [eq(postsTable.status, "published")];

    // Category filter: a slug → posts in that category; "uncategorized" → posts with no category.
    const categoryParam = typeof query.category === "string" ? query.category.trim() : "";
    if (categoryParam && categoryParam !== "all") {
      if (categoryParam === "uncategorized") {
        conditions.push(
          notExists(
            db.select({ _: sql`1` })
              .from(postCategoriesTable)
              .where(eq(postCategoriesTable.postId, postsTable.id)),
          ),
        );
      } else {
        conditions.push(
          inArray(
            postsTable.id,
            db.select({ postId: postCategoriesTable.postId })
              .from(postCategoriesTable)
              .innerJoin(categoriesTable, eq(postCategoriesTable.categoryId, categoriesTable.id))
              .where(eq(categoriesTable.slug, categoryParam)),
          ),
        );
      }
    }

    // Source filter: "original" → source_feed_id IS NULL; a numeric ID → that specific source.
    const sourceParam = typeof query.source === "string" ? query.source.trim() : "";
    if (sourceParam && sourceParam !== "all") {
      if (sourceParam === "original") {
        conditions.push(isNull(postsTable.sourceFeedId));
      } else {
        const sourceId = Number.parseInt(sourceParam, 10);
        if (Number.isFinite(sourceId) && sourceId > 0) {
          conditions.push(eq(postsTable.sourceFeedId, sourceId));
        }
      }
    }

    const whereClause = and(...conditions);

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
      .where(whereClause)
      .groupBy(postsTable.id)
      .orderBy(desc(postsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: count() })
      .from(postsTable)
      .where(whereClause);
    const total = totalResult[0]?.count ?? 0;

    const hydrated = await attachCategoriesToPosts(posts);
    return res.json({ posts: hydrated, total, page, limit });
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

    // Pre-validate categoryIds outside the transaction so a 400 never
    // requires rolling back any writes. Strict: every supplied value
    // must be a positive integer that already exists.
    if (Array.isArray(body.categoryIds) && body.categoryIds.length > 0) {
      try {
        await validateCategoryIds(body.categoryIds);
      } catch (err) {
        const unknownIds = (err as { unknownIds?: number[] })?.unknownIds;
        if (Array.isArray(unknownIds) && unknownIds.length > 0) {
          return res
            .status(400)
            .json({ error: (err as Error).message, unknownIds });
        }
        throw err;
      }
    }

    // Single transaction: post insert + category join writes commit
    // together, so a mid-flight failure leaves the table in its
    // pre-request state instead of stranding an uncategorized post.
    const insertedId = await db.transaction(async (tx) => {
      const insertResult = await tx
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
          createdAt: formatMysqlDateTime(),
        })
        .$returningId();
      const newId = insertResult[0]?.id;
      if (!newId) throw new Error("Failed to create post");
      if (Array.isArray(body.categoryIds) && body.categoryIds.length > 0) {
        await replacePostCategories(newId, body.categoryIds, tx);
      }
      return newId;
    });

    const post = await db.select().from(postsTable).where(eq(postsTable.id, insertedId)).limit(1);
    if (!post[0]) {
      return res.status(500).json({ error: "Failed to load created post" });
    }

    const categoriesMap = await hydratePostCategories([insertedId]);
    return res.status(201).json({
      ...post[0],
      commentCount: 0,
      categories: categoriesMap.get(insertedId) ?? [],
    });
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

    const categoriesMap = await hydratePostCategories([id]);
    return res.json({
      post: { ...post, categories: categoriesMap.get(id) ?? [] },
      comments,
    });
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

    // Strictly validate any supplied categoryIds BEFORE the
    // transaction so a 400 leaves the post completely unchanged.
    if (Array.isArray(body.categoryIds) && body.categoryIds.length > 0) {
      try {
        await validateCategoryIds(body.categoryIds);
      } catch (err) {
        const unknownIds = (err as { unknownIds?: number[] })?.unknownIds;
        if (Array.isArray(unknownIds) && unknownIds.length > 0) {
          return res
            .status(400)
            .json({ error: (err as Error).message, unknownIds });
        }
        throw err;
      }
    }

    // Wrap the content update and the category-set replacement in a
    // single transaction so a mid-flight failure can't leave the post
    // and its category links in inconsistent states.
    await db.transaction(async (tx) => {
      await tx
        .update(postsTable)
        .set({
          content: normalizedContent,
          // Recompute the search shadow column in the same statement so
          // `posts.content` and `posts.content_text` cannot drift.
          contentText: computeContentText(normalizedContent, body.contentFormat),
          contentFormat: body.contentFormat,
        })
        .where(eq(postsTable.id, id));
      if (Array.isArray(body.categoryIds)) {
        await replacePostCategories(id, body.categoryIds, tx);
      }
    });

    const updatedPost = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    if (!updatedPost[0]) {
      return res.status(500).json({ error: "Failed to load updated post" });
    }

    const commentCountResult = await db
      .select({ count: count(commentsTable.id) })
      .from(commentsTable)
      .where(eq(commentsTable.postId, id));
    const categoriesMap = await hydratePostCategories([id]);

    return res.json({
      ...updatedPost[0],
      commentCount: commentCountResult[0]?.count ?? 0,
      categories: categoriesMap.get(id) ?? [],
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
