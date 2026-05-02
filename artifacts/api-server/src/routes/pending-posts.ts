import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  postsTable,
  feedSourcesTable,
  eq,
  desc,
  count,
} from "@workspace/db";
import { requireAuth, requireOwner } from "../middlewares/auth";
import { GetPostParams } from "@workspace/api-zod";
import { attachCategoriesToPosts } from "../lib/post-categories";

const router: IRouter = Router();

const PENDING_DEFAULT_LIMIT = 50;
const PENDING_MAX_LIMIT = 200;

// GET /posts/pending — owner-only moderation queue (paginated).
router.get(
  "/posts/pending",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const rawPage = Number.parseInt(String(req.query.page ?? "1"), 10);
      const rawLimit = Number.parseInt(String(req.query.limit ?? PENDING_DEFAULT_LIMIT), 10);
      const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
      const limit =
        Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.min(rawLimit, PENDING_MAX_LIMIT)
          : PENDING_DEFAULT_LIMIT;
      const offset = (page - 1) * limit;

      const rows = await db
        .select({
          id: postsTable.id,
          authorName: postsTable.authorName,
          authorImageUrl: postsTable.authorImageUrl,
          content: postsTable.content,
          contentFormat: postsTable.contentFormat,
          createdAt: postsTable.createdAt,
          status: postsTable.status,
          sourceFeedId: postsTable.sourceFeedId,
          sourceGuid: postsTable.sourceGuid,
          sourceCanonicalUrl: postsTable.sourceCanonicalUrl,
          sourceFeedName: feedSourcesTable.name,
          sourceSiteUrl: feedSourcesTable.siteUrl,
        })
        .from(postsTable)
        .leftJoin(feedSourcesTable, eq(feedSourcesTable.id, postsTable.sourceFeedId))
        .where(eq(postsTable.status, "pending"))
        .orderBy(desc(postsTable.createdAt))
        .limit(limit)
        .offset(offset);

      const totalRow = await db
        .select({ count: count() })
        .from(postsTable)
        .where(eq(postsTable.status, "pending"));

      const hydrated = await attachCategoriesToPosts(rows);
      return res.json({
        posts: hydrated,
        total: totalRow[0]?.count ?? 0,
        page,
        limit,
      });
    } catch (err) {
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// POST /posts/:id/approve — flip pending → published. Ledger untouched.
router.post(
  "/posts/:id/approve",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const { id } = GetPostParams.parse(req.params);
      const rows = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
      const post = rows[0];
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      if (post.status !== "pending") {
        return res.status(409).json({ error: "Post is not pending" });
      }

      await db
        .update(postsTable)
        .set({ status: "published" })
        .where(eq(postsTable.id, id));

      return res.json({ id, status: "published" });
    } catch (err) {
      return res.status(400).json({ error: "Invalid request" });
    }
  },
);

// POST /posts/:id/reject — delete a pending post. Ledger row stays.
router.post(
  "/posts/:id/reject",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const { id } = GetPostParams.parse(req.params);
      const rows = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
      const post = rows[0];
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      if (post.status !== "pending") {
        return res.status(409).json({ error: "Post is not pending" });
      }

      await db.delete(postsTable).where(eq(postsTable.id, id));

      return res.status(204).send();
    } catch (err) {
      return res.status(400).json({ error: "Invalid request" });
    }
  },
);

export default router;
