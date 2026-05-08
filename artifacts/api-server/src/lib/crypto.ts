import crypto from "node:crypto";

function getEncryptionKey(): Buffer {
  const raw = process.env.AI_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("Missing required environment variable: AI_SETTINGS_ENCRYPTION_KEY");
  }

  const hexCandidate = /^[0-9a-f]+$/i.test(raw) && raw.length % 2 === 0
    ? Buffer.from(raw, "hex")
    : null;
  if (hexCandidate?.length === 32) {
    return hexCandidate;
  }

  try {
    const base64Candidate = Buffer.from(raw, "base64");
    if (base64Candidate.length === 32) {
      return base64Candidate;
    }
  } catch {
    // fall through to raw bytes
  }

  const utf8Candidate = Buffer.from(raw, "utf8");
  if (utf8Candidate.length === 32) {
    return utf8Candidate;
  }

  throw new Error(
    "AI_SETTINGS_ENCRYPTION_KEY must decode to exactly 32 bytes (base64, hex, or raw text)",
  );
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Returns an opaque "<iv_b64>.<tag_b64>.<ciphertext_b64>" triplet.
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

/**
 * Decrypt a payload produced by encryptSecret.
 * Throws if the payload is malformed or the auth tag fails.
 */
export function decryptSecret(payload: string): string {
  const key = getEncryptionKey();
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");

  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Malformed encrypted payload");
  }

  const iv = Buffer.from(ivRaw, "base64");
  const tag = Buffer.from(tagRaw, "base64");
  const encrypted = Buffer.from(encryptedRaw, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
