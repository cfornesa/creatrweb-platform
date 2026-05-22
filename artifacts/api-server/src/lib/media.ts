import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { fileURLToPath } from "node:url";
import { db, mediaAssetsTable, eq } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEDIA_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "data", "uploads");
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export function ensureMediaRoot() {
  if (!fs.existsSync(MEDIA_ROOT)) {
    fs.mkdirSync(MEDIA_ROOT, { recursive: true });
  }
}

export function getMediaPath(fileName: string) {
  return path.join(MEDIA_ROOT, path.basename(fileName));
}

export async function storeUploadedImage(buffer: Buffer) {
  const detectedType = await fileTypeFromBuffer(buffer);
  if (!detectedType || !ALLOWED_MIME_TYPES.has(detectedType.mime)) {
    throw new Error("Unsupported media type");
  }

  ensureMediaRoot();

  const extension = MIME_EXTENSION_MAP[detectedType.mime] ?? `.${detectedType.ext}`;
  const fileName = `${randomUUID()}${extension}`;
  const filePath = getMediaPath(fileName);
  await fs.promises.writeFile(filePath, buffer);

  return {
    fileName,
    mimeType: detectedType.mime,
    url: `/api/media/${fileName}`,
  };
}

export async function backfillMediaAssetsFromFilesystem(): Promise<void> {
  if (!fs.existsSync(MEDIA_ROOT)) {
    return;
  }

  const files = fs.readdirSync(MEDIA_ROOT).filter((f) => !f.startsWith("."));

  for (const fileName of files) {
    const existing = await db
      .select({ id: mediaAssetsTable.id })
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.filename, fileName))
      .limit(1);

    if (existing.length > 0) {
      continue;
    }

    const filePath = getMediaPath(fileName);
    const buffer = await fs.promises.readFile(filePath);
    const detected = await fileTypeFromBuffer(buffer);
    const mimeType = detected?.mime ?? "application/octet-stream";

    await db.insert(mediaAssetsTable).values({
      url: `/api/media/${fileName}`,
      filename: fileName,
      mimeType,
    });
  }
}
