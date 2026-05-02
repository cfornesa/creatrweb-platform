import { Router, type IRouter, type Request, type Response } from "express";
import { db, postsTable, commentsTable, eq, desc, count } from "@workspace/db";
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
import { sanitizeRichHtml } from "../lib/html";
import { generatePostOgImage } from "../lib/og";

const router: IRouter = Router();

// GET /og/posts/:id — generate dynamic OG image
router.get("/og/posts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = GetPostParams.parse(req.params);

    const post = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    if (!post[0]) {
      return res.status(404).json({ error: "Post not found" });
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
        createdAt: postsTable.createdAt,
        commentCount: count(commentsTable.id),
      })
      .from(postsTable)
      .leftJoin(commentsTable, eq(commentsTable.postId, postsTable.id))
      .where(eq(postsTable.authorId, userId))
      .groupBy(postsTable.id)
      .orderBy(desc(postsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.authorId, userId));
    const total = totalResult[0]?.count ?? 0;

    return res.json({ posts, total, page, limit });
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
        createdAt: postsTable.createdAt,
        commentCount: count(commentsTable.id),
      })
      .from(postsTable)
      .leftJoin(commentsTable, eq(commentsTable.postId, postsTable.id))
      .groupBy(postsTable.id)
      .orderBy(desc(postsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db.select({ count: count() }).from(postsTable);
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
        createdAt: postsTable.createdAt,
        commentCount: count(commentsTable.id),
      })
      .from(postsTable)
      .leftJoin(commentsTable, eq(commentsTable.postId, postsTable.id))
      .where(eq(postsTable.id, id))
      .groupBy(postsTable.id);

    const post = postRows[0];
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
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
