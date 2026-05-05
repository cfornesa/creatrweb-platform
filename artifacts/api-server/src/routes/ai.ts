import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  eq,
  mysqlPool,
  userAiVendorSettingsTable,
} from "@workspace/db";
import {
  GetMyAiSettingsResponse,
  ProcessAiTextBody,
  ProcessAiTextResponse,
  UpdateMyAiSettingsBody,
} from "@workspace/api-zod";
import { requireAuth, requireOwner } from "../middlewares/auth";
import {
  decryptAiApiKey,
  encryptAiApiKey,
  getAiVendorLabel,
  normalizeAiVendorSettingsInput,
  normalizeOptionalString,
  toSafeAiSettingsResponse,
  validateAiVendorSettingsInput,
  type AiVendor,
} from "../lib/ai-settings";
import { stripHtmlToText } from "../lib/html";
import { AiProviderError, processTextWithProvider } from "../lib/ai-providers";

const router: IRouter = Router();
const AI_SYSTEM_PROMPT =
  "Improve the quality and expand this text while maintaining the original author's voice.";
const AI_NO_STORE_CACHE_CONTROL = "no-store, max-age=0";

function setAiNoStoreHeaders(res: Response) {
  res.setHeader("Cache-Control", AI_NO_STORE_CACHE_CONTROL);
}

async function loadUserAiSettings(userId: string) {
  return db
    .select()
    .from(userAiVendorSettingsTable)
    .where(eq(userAiVendorSettingsTable.userId, userId));
}

function indexRowsByVendor(
  rows: Awaited<ReturnType<typeof loadUserAiSettings>>,
) {
  return new Map(rows.map((row) => [row.vendor, row] as const));
}

// GET /users/me/ai-settings
router.get("/users/me/ai-settings", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    setAiNoStoreHeaders(res);
    const rows = await loadUserAiSettings(req.currentUser!.id);
    const response = GetMyAiSettingsResponse.parse(toSafeAiSettingsResponse(rows));
    return res.json(response);
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

// PATCH /users/me/ai-settings
router.patch("/users/me/ai-settings", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    setAiNoStoreHeaders(res);
    const parsed = UpdateMyAiSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const currentUser = req.currentUser!;
    const existingRows = await loadUserAiSettings(currentUser.id);
    const existingByVendor = indexRowsByVendor(existingRows);

    for (const item of parsed.data.settings) {
      const normalized = normalizeAiVendorSettingsInput(item);
      if (!normalized) {
        return res.status(400).json({ error: `Unsupported AI vendor "${item.vendor}"` });
      }

      const existing = existingByVendor.get(normalized.vendor);
      const nextEnabled = normalized.enabled ?? (existing?.enabled === 1);
      const nextModel = normalized.model ?? normalizeOptionalString(existing?.model) ?? null;
      const nextEncryptedApiKey = normalized.apiKey
        ? encryptAiApiKey(normalized.apiKey)
        : normalizeOptionalString(existing?.encryptedApiKey) ?? null;
      const vendorLabel = getAiVendorLabel(normalized.vendor) ?? normalized.vendor;

      const validationError = validateAiVendorSettingsInput({
        vendorLabel,
        enabled: nextEnabled,
        model: nextModel,
        encryptedApiKey: nextEncryptedApiKey,
      });

      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      await mysqlPool.query(
        `INSERT INTO user_ai_vendor_settings
           (user_id, vendor, enabled, model, encrypted_api_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE
           enabled = VALUES(enabled),
           model = VALUES(model),
           encrypted_api_key = VALUES(encrypted_api_key),
           updated_at = CURRENT_TIMESTAMP(3)`,
        [
          currentUser.id,
          normalized.vendor,
          nextEnabled ? 1 : 0,
          nextModel,
          nextEncryptedApiKey,
        ],
      );
    }

    const rows = await loadUserAiSettings(currentUser.id);
    const response = GetMyAiSettingsResponse.parse(toSafeAiSettingsResponse(rows));
    return res.json(response);
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

// POST /ai/process
router.post("/ai/process", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    setAiNoStoreHeaders(res);
    const parsed = ProcessAiTextBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const rows = await loadUserAiSettings(req.currentUser!.id);
    const selected = rows.find((row) => row.vendor === parsed.data.vendor);
    const model = normalizeOptionalString(selected?.model);
    const encryptedApiKey = normalizeOptionalString(selected?.encryptedApiKey);

    if (selected?.enabled !== 1 || !model || !encryptedApiKey) {
      return res.status(409).json({
        error: `${getAiVendorLabel(parsed.data.vendor) ?? "Selected AI vendor"} is not enabled and configured for this user`,
      });
    }

    const plainText = stripHtmlToText(parsed.data.content);
    if (!plainText) {
      return res.status(400).json({ error: "Content must contain visible text" });
    }

    const apiKey = decryptAiApiKey(encryptedApiKey);
    const text = await processTextWithProvider({
      vendor: parsed.data.vendor as AiVendor,
      model,
      apiKey,
      plainText,
      systemPrompt: AI_SYSTEM_PROMPT,
    });

    const response = ProcessAiTextResponse.parse({
      text,
      vendor: parsed.data.vendor,
      vendorLabel: getAiVendorLabel(parsed.data.vendor) ?? parsed.data.vendor,
      model,
    });

    return res.json(response);
  } catch (error) {
    if (error instanceof AiProviderError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
