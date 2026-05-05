import { Router, type IRouter, type Request, type Response } from "express";
import { db, commentsTable, postsTable, eq, formatMysqlDateTime } from "@workspace/db";
import { CreateCommentBody, CreateCommentParams, DeleteCommentParams, UpdateCommentBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// POST /posts/:postId/comments
router.post("/posts/:postId/comments", requireAuth, async (req: Request, res: Response) => {
  try {
    const { postId } = CreateCommentParams.parse(req.params);
    const body = CreateCommentBody.parse(req.body);
    const currentUser = req.currentUser!;
    const authorName = currentUser.name || currentUser.email || "Anonymous";

    const post = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
    if (!post[0]) {
      return res.status(404).json({ error: "Post not found" });
    }
    // Pending posts are owner-only; non-owners get 404.
    if (post[0].status === "pending" && currentUser.role !== "owner") {
      return res.status(404).json({ error: "Post not found" });
    }

    const insertResult = await db
      .insert(commentsTable)
      .values({
        postId,
        authorId: currentUser.id,
        authorUserId: currentUser.id,
        authorName,
        authorImageUrl: currentUser.image,
        content: body.content,
        createdAt: formatMysqlDateTime(),
      })
      .$returningId();

    const insertedId = insertResult[0]?.id;
    if (!insertedId) {
      return res.status(500).json({ error: "Failed to create comment" });
    }

    const comment = await db.select().from(commentsTable).where(eq(commentsTable.id, insertedId)).limit(1);
    if (!comment[0]) {
      return res.status(500).json({ error: "Failed to load created comment" });
    }

    return res.status(201).json(comment[0]);
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// PATCH /comments/:id
router.patch("/comments/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = DeleteCommentParams.parse(req.params);
    const body = UpdateCommentBody.parse(req.body);

    const comment = await db.select().from(commentsTable).where(eq(commentsTable.id, id)).limit(1);
    if (!comment[0]) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const canEdit =
      comment[0].authorUserId === req.currentUser!.id ||
      comment[0].authorId === req.currentUser!.id ||
      req.currentUser!.role === "owner";

    if (!canEdit) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await db
      .update(commentsTable)
      .set({
        content: body.content.trim(),
      })
      .where(eq(commentsTable.id, id));

    const updatedComment = await db.select().from(commentsTable).where(eq(commentsTable.id, id)).limit(1);
    if (!updatedComment[0]) {
      return res.status(500).json({ error: "Failed to load updated comment" });
    }

    return res.json(updatedComment[0]);
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// DELETE /comments/:id
router.delete("/comments/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = DeleteCommentParams.parse(req.params);

    const comment = await db.select().from(commentsTable).where(eq(commentsTable.id, id)).limit(1);
    if (!comment[0]) {
      return res.status(404).json({ error: "Comment not found" });
    }
    const canDelete =
      comment[0].authorUserId === req.currentUser!.id ||
      comment[0].authorId === req.currentUser!.id ||
      req.currentUser!.role === "owner";

    if (!canDelete) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await db.delete(commentsTable).where(eq(commentsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

export default router;
