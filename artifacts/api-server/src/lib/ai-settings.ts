import crypto from "node:crypto";
import type { UserAiVendorSettings } from "@workspace/db";

export const AI_VENDOR_OPTIONS = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "opencode-zen", label: "Opencode Zen" },
  { id: "opencode-go", label: "Opencode Go" },
  { id: "google", label: "Google" },
] as const;

export type AiVendor = (typeof AI_VENDOR_OPTIONS)[number]["id"];

export type SafeAiVendorSetting = {
  vendor: AiVendor;
  vendorLabel: string;
  enabled: boolean;
  configured: boolean;
  model: string | null;
};

export type SafeAiSettingsResponse = {
  availableVendors: readonly { id: AiVendor; label: string }[];
  settings: SafeAiVendorSetting[];
};

export type NormalizedAiVendorSettingsInput = {
  vendor: AiVendor;
  enabled?: boolean;
  model?: string;
  apiKey?: string;
};

export function isAiVendor(value: string): value is AiVendor {
  return AI_VENDOR_OPTIONS.some((option) => option.id === value);
}

export function getAiVendorLabel(vendor: string | null | undefined): string | null {
  if (!vendor || !isAiVendor(vendor)) {
    return null;
  }

  return AI_VENDOR_OPTIONS.find((option) => option.id === vendor)?.label ?? null;
}

export function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeAiVendorSettingsInput(input: {
  vendor: string;
  enabled?: boolean;
  model?: string;
  apiKey?: string;
}): NormalizedAiVendorSettingsInput | null {
  const vendor = input.vendor.trim();
  if (!isAiVendor(vendor)) {
    return null;
  }

  const normalized: NormalizedAiVendorSettingsInput = { vendor };

  if (typeof input.enabled === "boolean") {
    normalized.enabled = input.enabled;
  }

  const model = normalizeOptionalString(input.model);
  if (model) {
    normalized.model = model;
  }

  const apiKey = normalizeOptionalString(input.apiKey);
  if (apiKey) {
    normalized.apiKey = apiKey;
  }

  return normalized;
}

export function validateAiVendorSettingsInput(input: {
  vendorLabel: string;
  enabled: boolean;
  model: string | null;
  encryptedApiKey: string | null;
}): string | null {
  if (!input.enabled) {
    return null;
  }
  if (!input.model) {
    return `${input.vendorLabel} requires a model before it can be enabled`;
  }
  if (!input.encryptedApiKey) {
    return `${input.vendorLabel} requires an API key before it can be enabled`;
  }
  return null;
}

export function toSafeAiSettingsResponse(
  rows: Array<Pick<UserAiVendorSettings, "vendor" | "enabled" | "model" | "encryptedApiKey">>,
): SafeAiSettingsResponse {
  const byVendor = new Map<string, Pick<UserAiVendorSettings, "vendor" | "enabled" | "model" | "encryptedApiKey">>();
  for (const row of rows) {
    byVendor.set(row.vendor, row);
  }

  return {
    availableVendors: AI_VENDOR_OPTIONS,
    settings: AI_VENDOR_OPTIONS.map((option) => {
      const row = byVendor.get(option.id);
      const model = normalizeOptionalString(row?.model);
      const enabled = row?.enabled === 1;
      const configured = Boolean(model && normalizeOptionalString(row?.encryptedApiKey));

      return {
        vendor: option.id,
        vendorLabel: option.label,
        enabled,
        configured,
        model,
      };
    }),
  };
}

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

export function encryptAiApiKey(apiKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptAiApiKey(payload: string): string {
  const key = getEncryptionKey();
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");

  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Malformed encrypted AI API key payload");
  }

  const iv = Buffer.from(ivRaw, "base64");
  const tag = Buffer.from(tagRaw, "base64");
  const encrypted = Buffer.from(encryptedRaw, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
