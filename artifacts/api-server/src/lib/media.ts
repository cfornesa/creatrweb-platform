import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { fileURLToPath } from "node:url";
import { db, mediaAssetsTable, eq, isNull } from "@workspace/db";

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

  const extension = MIME_EXTENSION_MAP[detectedType.mime] ?? `.${detectedType.ext}`;
  const fileName = `${randomUUID()}${extension}`;
  const url = `/api/media/${fileName}`;

  await db.insert(mediaAssetsTable).values({
    url,
    filename: fileName,
    mimeType: detectedType.mime,
    fileData: buffer,
  });

  return {
    fileName,
    mimeType: detectedType.mime,
    url,
  };
}

export async function getMediaBuffer(fileName: string): Promise<Buffer | null> {
  const [row] = await db
    .select({ fileData: mediaAssetsTable.fileData })
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.filename, fileName))
    .limit(1);

  const data = row?.fileData;
  if (!data) return null;
  return Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
}

export async function backfillMediaAssetsFromFilesystem(): Promise<void> {
  // Phase 1: insert DB records for any disk files that have no record yet.
  if (fs.existsSync(MEDIA_ROOT)) {
    const files = fs.readdirSync(MEDIA_ROOT).filter((f) => !f.startsWith("."));

    for (const fileName of files) {
      const existing = await db
        .select({ id: mediaAssetsTable.id })
        .from(mediaAssetsTable)
        .where(eq(mediaAssetsTable.filename, fileName))
        .limit(1);

      if (existing.length === 0) {
        const filePath = getMediaPath(fileName);
        const fileBuffer = await fs.promises.readFile(filePath);
        const detected = await fileTypeFromBuffer(fileBuffer);
        const mimeType = detected?.mime ?? "application/octet-stream";

        await db.insert(mediaAssetsTable).values({
          url: `/api/media/${fileName}`,
          filename: fileName,
          mimeType,
          fileData: fileBuffer,
        });
      }
    }
  }

  // Phase 2: for any existing DB record with no fileData, populate from disk.
  const missingBlob = await db
    .select({ id: mediaAssetsTable.id, filename: mediaAssetsTable.filename })
    .from(mediaAssetsTable)
    .where(isNull(mediaAssetsTable.fileData));

  for (const row of missingBlob) {
    const filePath = getMediaPath(row.filename);
    if (fs.existsSync(filePath)) {
      const data = await fs.promises.readFile(filePath);
      await db
        .update(mediaAssetsTable)
        .set({ fileData: data })
        .where(eq(mediaAssetsTable.id, row.id));
    }
  }
}
