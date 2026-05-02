import fs from "node:fs";
import path from "node:path";
import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth, requireOwner } from "../middlewares/auth";
import { createRateLimitMiddleware } from "../lib/ratelimit";
import { ensureMediaRoot, getMediaPath, storeUploadedImage } from "../lib/media";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
});

router.post(
  "/media",
  createRateLimitMiddleware({ windowMs: 60_000, max: 20 }),
  requireAuth,
  requireOwner,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: "File upload is required" });
      }

      const uploaded = await storeUploadedImage(req.file.buffer);
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
