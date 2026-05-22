import fs from "node:fs";
import path from "node:path";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth, requireOwner } from "../middlewares/auth";
import { createRateLimitMiddleware } from "../lib/ratelimit";
import { ensureMediaRoot, getMediaPath, storeUploadedImage } from "../lib/media";
import { db, mediaAssetsTable, desc, eq } from "@workspace/db";

const router: IRouter = Router();
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1024 / 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
  },
});

function uploadSingleFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: `Image uploads must be ${MAX_UPLOAD_MB} MB or smaller` });
        return;
      }
      res.status(400).json({ error: error.message || "Invalid upload" });
      return;
    }

    next(error);
  });
}

router.post(
  "/media",
  createRateLimitMiddleware({ windowMs: 60_000, max: 20 }),
  requireAuth,
  requireOwner,
  uploadSingleFile,
  async (req: Request, res: Response) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: "File upload is required" });
      }

      const uploaded = await storeUploadedImage(req.file.buffer);

      await db.insert(mediaAssetsTable).values({
        url: uploaded.url,
        filename: uploaded.fileName,
        mimeType: uploaded.mimeType,
      });

      return res.status(201).json({
        url: uploaded.url,
        mimeType: uploaded.mimeType,
        width: null,
        height: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid upload";
      return res.status(400).json({ error: message });
    }
  },
);

router.get(
  "/media",
  createRateLimitMiddleware({ windowMs: 60_000, max: 120 }),
  requireAuth,
  requireOwner,
  async (_req: Request, res: Response) => {
    const assets = await db
      .select()
      .from(mediaAssetsTable)
      .orderBy(desc(mediaAssetsTable.uploadedAt));
    return res.json(assets);
  },
);

router.patch(
  "/media/:fileName",
  createRateLimitMiddleware({ windowMs: 60_000, max: 60 }),
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    const rawFileName = Array.isArray(req.params.fileName) ? req.params.fileName[0] : req.params.fileName;
    const fileName = path.basename(rawFileName);

    const { altText } = req.body as { altText?: unknown };
    if (altText !== null && altText !== undefined && typeof altText !== "string") {
      return res.status(400).json({ error: "altText must be a string or null" });
    }

    const [asset] = await db
      .select()
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.filename, fileName))
      .limit(1);

    if (!asset) {
      return res.status(404).json({ error: "Media not found" });
    }

    const [updated] = await db
      .update(mediaAssetsTable)
      .set({ altText: typeof altText === "string" ? altText : null })
      .where(eq(mediaAssetsTable.filename, fileName));

    void updated;

    const [fresh] = await db
      .select()
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.filename, fileName))
      .limit(1);

    return res.json(fresh);
  },
);

router.delete(
  "/media/:fileName",
  createRateLimitMiddleware({ windowMs: 60_000, max: 60 }),
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    const rawFileName = Array.isArray(req.params.fileName) ? req.params.fileName[0] : req.params.fileName;
    const fileName = path.basename(rawFileName);
    const url = `/api/media/${fileName}`;

    const [asset] = await db
      .select()
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.filename, fileName))
      .limit(1);

    if (!asset) {
      return res.status(404).json({ error: "Media not found" });
    }

    const filePath = getMediaPath(fileName);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }

    await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.url, url));

    return res.status(204).end();
  },
);

router.get(
  "/media/:fileName",
  createRateLimitMiddleware({ windowMs: 60_000, max: 120 }),
  async (req: Request, res: Response) => {
    ensureMediaRoot();
    const rawFileName = Array.isArray(req.params.fileName) ? req.params.fileName[0] : req.params.fileName;
    const fileName = path.basename(rawFileName);
    const filePath = getMediaPath(fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Media not found" });
    }

    return res.sendFile(filePath);
  },
);

export default router;
