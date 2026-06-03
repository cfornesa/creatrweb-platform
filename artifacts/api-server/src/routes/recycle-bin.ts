import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  postsTable,
  artPiecesTable,
  mediaAssetsTable,
  eq,
  and,
  isNull,
  isNotNull,
  desc,
  inArray,
  sql,
} from "@workspace/db";
import { requireAuth, requireOwner } from "../middlewares/auth";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.object({ id: z.coerce.number().int().positive() });

const BulkDeleteBody = z.object({
  postIds: z.array(z.number().int().positive()).optional(),
  pieceIds: z.array(z.number().int().positive()).optional(),
  mediaIds: z.array(z.number().int().positive()).optional(),
});

// GET /recycle-bin — list all soft-deleted items
router.get("/recycle-bin", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const userId = req.currentUser!.id;

    const [posts, pieces, media] = await Promise.all([
      db
        .select({
          id: postsTable.id,
          title: postsTable.title,
          content: postsTable.content,
          contentFormat: postsTable.contentFormat,
          status: postsTable.status,
          createdAt: postsTable.createdAt,
          deletedAt: postsTable.deletedAt,
        })
        .from(postsTable)
        .where(and(eq(postsTable.authorUserId, userId), isNotNull(postsTable.deletedAt)))
        .orderBy(desc(postsTable.deletedAt)),

      db
        .select({
          id: artPiecesTable.id,
          title: artPiecesTable.title,
          engine: artPiecesTable.engine,
          thumbnailUrl: artPiecesTable.thumbnailUrl,
          createdAt: artPiecesTable.createdAt,
          deletedAt: artPiecesTable.deletedAt,
        })
        .from(artPiecesTable)
        .where(and(eq(artPiecesTable.ownerUserId, userId), isNotNull(artPiecesTable.deletedAt)))
        .orderBy(desc(artPiecesTable.deletedAt)),

      db
        .select({
          id: mediaAssetsTable.id,
          url: mediaAssetsTable.url,
          filename: mediaAssetsTable.filename,
          title: mediaAssetsTable.title,
          mimeType: mediaAssetsTable.mimeType,
          altText: mediaAssetsTable.altText,
          uploadedAt: mediaAssetsTable.uploadedAt,
          deletedAt: mediaAssetsTable.deletedAt,
        })
        .from(mediaAssetsTable)
        .where(isNotNull(mediaAssetsTable.deletedAt))
        .orderBy(desc(mediaAssetsTable.deletedAt)),
    ]);

    return res.json({ posts, pieces, media });
  } catch (err) {
    console.error("GET /recycle-bin failed:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /recycle-bin/posts/:id/restore
router.post("/recycle-bin/posts/:id/restore", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const { id } = IdParam.parse(req.params);
    const userId = req.currentUser!.id;

    const [post] = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(and(eq(postsTable.id, id), eq(postsTable.authorUserId, userId), isNotNull(postsTable.deletedAt)))
      .limit(1);

    if (!post) return res.status(404).json({ error: "Not found in Recycle Bin" });

    await db.update(postsTable).set({ deletedAt: null }).where(eq(postsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// POST /recycle-bin/pieces/:id/restore
router.post("/recycle-bin/pieces/:id/restore", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const { id } = IdParam.parse(req.params);
    const userId = req.currentUser!.id;

    const [piece] = await db
      .select({ id: artPiecesTable.id })
      .from(artPiecesTable)
      .where(and(eq(artPiecesTable.id, id), eq(artPiecesTable.ownerUserId, userId), isNotNull(artPiecesTable.deletedAt)))
      .limit(1);

    if (!piece) return res.status(404).json({ error: "Not found in Recycle Bin" });

    await db.update(artPiecesTable).set({ deletedAt: null }).where(eq(artPiecesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// POST /recycle-bin/media/:id/restore
router.post("/recycle-bin/media/:id/restore", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const { id } = IdParam.parse(req.params);

    const [asset] = await db
      .select({ id: mediaAssetsTable.id })
      .from(mediaAssetsTable)
      .where(and(eq(mediaAssetsTable.id, id), isNotNull(mediaAssetsTable.deletedAt)))
      .limit(1);

    if (!asset) return res.status(404).json({ error: "Not found in Recycle Bin" });

    await db.update(mediaAssetsTable).set({ deletedAt: null }).where(eq(mediaAssetsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// DELETE /recycle-bin/posts/:id — permanently delete a single trashed post
router.delete("/recycle-bin/posts/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const { id } = IdParam.parse(req.params);
    const userId = req.currentUser!.id;

    const [post] = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(and(eq(postsTable.id, id), eq(postsTable.authorUserId, userId), isNotNull(postsTable.deletedAt)))
      .limit(1);

    if (!post) return res.status(404).json({ error: "Not found in Recycle Bin" });

    await db.delete(postsTable).where(eq(postsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// DELETE /recycle-bin/pieces/:id — permanently delete a single trashed piece
router.delete("/recycle-bin/pieces/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const { id } = IdParam.parse(req.params);
    const userId = req.currentUser!.id;

    const [piece] = await db
      .select({ id: artPiecesTable.id })
      .from(artPiecesTable)
      .where(and(eq(artPiecesTable.id, id), eq(artPiecesTable.ownerUserId, userId), isNotNull(artPiecesTable.deletedAt)))
      .limit(1);

    if (!piece) return res.status(404).json({ error: "Not found in Recycle Bin" });

    await db.delete(artPiecesTable).where(eq(artPiecesTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// DELETE /recycle-bin/media/:id — permanently delete a single trashed media asset
router.delete("/recycle-bin/media/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const { id } = IdParam.parse(req.params);

    const [asset] = await db
      .select({ id: mediaAssetsTable.id })
      .from(mediaAssetsTable)
      .where(and(eq(mediaAssetsTable.id, id), isNotNull(mediaAssetsTable.deletedAt)))
      .limit(1);

    if (!asset) return res.status(404).json({ error: "Not found in Recycle Bin" });

    await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, id));
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

// DELETE /recycle-bin — bulk permanently delete
router.delete("/recycle-bin", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const body = BulkDeleteBody.parse(req.body);
    const userId = req.currentUser!.id;

    await Promise.all([
      body.postIds?.length
        ? db.delete(postsTable).where(
            and(
              inArray(postsTable.id, body.postIds),
              eq(postsTable.authorUserId, userId),
              isNotNull(postsTable.deletedAt),
            ),
          )
        : Promise.resolve(),

      body.pieceIds?.length
        ? db.delete(artPiecesTable).where(
            and(
              inArray(artPiecesTable.id, body.pieceIds),
              eq(artPiecesTable.ownerUserId, userId),
              isNotNull(artPiecesTable.deletedAt),
            ),
          )
        : Promise.resolve(),

      body.mediaIds?.length
        ? db.delete(mediaAssetsTable).where(
            and(
              inArray(mediaAssetsTable.id, body.mediaIds),
              isNotNull(mediaAssetsTable.deletedAt),
            ),
          )
        : Promise.resolve(),
    ]);

    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

export default router;
