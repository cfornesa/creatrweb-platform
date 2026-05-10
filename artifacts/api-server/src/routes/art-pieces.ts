import { Router, type IRouter, type Request, type Response } from "express";
import {
  artPieceEngineSchema as dbArtPieceEngineSchema,
  artPiecesTable,
  artPieceVersionsTable,
  db,
  desc,
  eq,
  inArray,
  mysqlPool,
  userAiVendorSettingsTable,
  type ArtPiece,
  type ArtPieceVersion,
} from "@workspace/db";
import { z } from "zod/v4";
import { requireAuth, requireOwner } from "../middlewares/auth";
import {
  ArtPieceGenerationError,
  StructuredArtPieceParseError,
  buildArtPieceRepairPrompt,
  buildInteractivePieceIframeHtml,
  compileStructuredArtPieceSpec,
  consumeValidatedDraftToken,
  getArtPieceGenerationSystemPrompt,
  getArtPieceGenerationLimits,
  issueValidatedDraftToken,
  parseStructuredArtPieceSpec,
  preflightCompiledArtPieceCode,
  serializeArtPiece,
  serializeArtPieceVersion,
  validateArtPieceEngine,
  validateArtPieceStatus,
} from "../lib/art-pieces";
import {
  decryptAiApiKey,
  getAiVendorLabel,
  normalizeOptionalString,
  type AiVendor,
} from "../lib/ai-settings";
import { AiProviderError, processTextWithProvider } from "../lib/ai-providers";

const router: IRouter = Router();

const artPieceEngineSchema = dbArtPieceEngineSchema;
const artPieceStatusSchema = z.enum(["active", "archived"]);
const aiVendorSchema = z.enum(["openrouter", "opencode-zen", "opencode-go", "google"]);

const GenerateArtPieceBody = z.object({
  prompt: z.string().trim().min(1).max(4000),
  engine: artPieceEngineSchema,
  vendor: aiVendorSchema,
});

const CreateArtPieceBody = z.object({
  draftToken: z.string().trim().min(1).max(191),
  thumbnailUrl: z.string().trim().url().max(2048).optional(),
});

const UpdateArtPieceBody = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
  status: artPieceStatusSchema.optional(),
  thumbnailUrl: z.string().trim().url().max(2048).nullable().optional(),
});

const CreateArtPieceVersionBody = z.object({
  draftToken: z.string().trim().min(1).max(191),
  title: z.string().trim().min(1).max(255).optional(),
  makeCurrent: z.boolean().optional(),
});

const PieceIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

const PieceEmbedQuery = z.object({
  version: z.coerce.number().int().positive().optional(),
});

async function loadOwnerAiSettings(userId: string) {
  return db
    .select()
    .from(userAiVendorSettingsTable)
    .where(eq(userAiVendorSettingsTable.userId, userId));
}

async function loadPiecesWithVersions(ownerUserId: string) {
  const pieces = await db
    .select()
    .from(artPiecesTable)
    .where(eq(artPiecesTable.ownerUserId, ownerUserId))
    .orderBy(desc(artPiecesTable.updatedAt));

  return attachCurrentVersions(pieces);
}

async function attachCurrentVersions(pieces: ArtPiece[]) {
  const versionIds = pieces
    .map((piece) => piece.currentVersionId)
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0);

  if (versionIds.length === 0) {
    return pieces.map((piece) => serializeArtPiece(piece, null));
  }

  const versions = await db
    .select()
    .from(artPieceVersionsTable)
    .where(inArray(artPieceVersionsTable.id, versionIds));
  const byId = new Map(versions.map((version) => [version.id, version] as const));

  return pieces.map((piece) => serializeArtPiece(piece, byId.get(piece.currentVersionId ?? -1) ?? null));
}

async function loadPieceOwnedByUser(id: number, ownerUserId: string) {
  const rows = await db
    .select()
    .from(artPiecesTable)
    .where(eq(artPiecesTable.id, id))
    .limit(1);
  const piece = rows[0] ?? null;
  if (!piece || piece.ownerUserId !== ownerUserId) {
    return null;
  }
  return piece;
}

async function loadVersionById(id: number) {
  const rows = await db
    .select()
    .from(artPieceVersionsTable)
    .where(eq(artPieceVersionsTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

function createGenerationAbortController(req: Request) {
  const controller = new AbortController();
  const { timeoutMs } = getArtPieceGenerationLimits();
  const timeout = setTimeout(() => controller.abort("timed_out"), timeoutMs);
  const cancel = () => controller.abort("cancelled");

  req.on("aborted", cancel);
  req.on("close", cancel);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      req.off("aborted", cancel);
      req.off("close", cancel);
    },
  };
}

function throwIfGenerationAborted(signal: AbortSignal, attemptCount: number) {
  if (!signal.aborted) {
    return;
  }

  const reason = signal.reason === "timed_out" ? "timed_out" : "cancelled";
  throw new ArtPieceGenerationError(
    reason === "timed_out"
      ? "Piece generation timed out before a validated draft was produced."
      : "Piece generation was cancelled before a validated draft was produced.",
    {
      statusCode: reason === "timed_out" ? 504 : 499,
      attemptCount,
      timedOut: reason === "timed_out",
      cancelled: reason !== "timed_out",
      failureStage: reason,
    },
  );
}

function classifyGenerationFailureStage(message: string): string {
  if (message.includes("valid JSON")) {
    return "json_parse";
  }
  if (message.includes("did not match the art piece schema") || message.includes("expected")) {
    return "schema_validation";
  }
  if (message.includes("did not parse")) {
    return "code_parse";
  }
  if (message.includes("server preflight")) {
    return "runtime_preflight";
  }
  if (message.includes("is not enabled and configured")) {
    return "vendor_configuration";
  }
  return "generation_validation";
}

async function generateValidatedDraft(input: {
  ownerUserId: string;
  prompt: string;
  engine: z.infer<typeof artPieceEngineSchema>;
  vendor: z.infer<typeof aiVendorSchema>;
  model: string;
  apiKey: string;
  signal: AbortSignal;
}) {
  const { maxAttempts } = getArtPieceGenerationLimits();
  let attemptCount = 0;
  let previousRawResponse: string | null = null;
  let previousFailureMessage = "The previous attempt did not pass validation.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfGenerationAborted(input.signal, attemptCount);
    attemptCount = attempt;

    const plainText = attempt === 1
      ? input.prompt
      : buildArtPieceRepairPrompt({
          engine: input.engine,
          originalPrompt: input.prompt,
          previousRawResponse,
          failureMessage: previousFailureMessage,
        });

    try {
      const responseText = await processTextWithProvider({
        vendor: input.vendor as AiVendor,
        model: input.model,
        apiKey: input.apiKey,
        plainText,
        systemPrompt: getArtPieceGenerationSystemPrompt(input.engine),
        signal: input.signal,
      });
      previousRawResponse = responseText;

      const structuredSpec = parseStructuredArtPieceSpec(input.engine, responseText);
      const generatedCode = preflightCompiledArtPieceCode(
        input.engine,
        compileStructuredArtPieceSpec(input.engine, structuredSpec),
      );

      const draftToken = issueValidatedDraftToken({
        ownerUserId: input.ownerUserId,
        title: structuredSpec.title,
        prompt: input.prompt,
        engine: input.engine,
        generatedCode,
        structuredSpec,
        notes: structuredSpec.notes?.trim() ? structuredSpec.notes.trim() : null,
        generationVendor: input.vendor,
        generationModel: input.model,
        validationStatus: "validated",
        attemptCount,
        maxAttempts,
        vendorLabel: getAiVendorLabel(input.vendor) ?? input.vendor,
        createdAt: Date.now(),
      });

      return {
        draftToken,
        title: structuredSpec.title,
        engine: input.engine,
        generatedCode,
        structuredSpec,
        notes: structuredSpec.notes?.trim() ? structuredSpec.notes.trim() : null,
        vendor: input.vendor,
        vendorLabel: getAiVendorLabel(input.vendor) ?? input.vendor,
        model: input.model,
        validationStatus: "validated" as const,
        attemptCount,
        maxAttempts,
        timedOut: false,
        cancelled: false,
        wasRepaired: attemptCount > 1,
      };
    } catch (error) {
      if (input.signal.aborted) {
        throwIfGenerationAborted(input.signal, attemptCount);
      }
      if (error instanceof AiProviderError && attemptCount >= maxAttempts) {
        throw new ArtPieceGenerationError(error.message, {
          statusCode: error.statusCode,
          attemptCount,
          maxAttempts,
          engine: input.engine,
          failureStage: "provider_request",
          rawResponsePreview: previousRawResponse?.slice(0, 600) ?? null,
        });
      }

      previousFailureMessage = error instanceof Error
        ? error.message
        : "The generated draft did not pass validation.";

      const failureStage = classifyGenerationFailureStage(previousFailureMessage);
      const parseError = error instanceof StructuredArtPieceParseError ? error : null;
      console.warn("Art piece generation attempt failed", {
        engine: input.engine,
        vendor: input.vendor,
        model: input.model,
        attemptCount,
        maxAttempts,
        failureStage,
        failureMessage: previousFailureMessage,
        rawResponsePreview: previousRawResponse?.slice(0, 600) ?? null,
        normalizedResponsePreview: parseError?.normalizedResponse?.slice(0, 600) ?? null,
        normalizationApplied: parseError?.normalizationApplied ?? false,
        normalizationSummary: parseError?.normalizationSummary ?? null,
        issuePath: parseError?.issuePath ?? [],
        entityType: parseError?.entityType ?? null,
      });

      if (attemptCount >= maxAttempts) {
        throw new ArtPieceGenerationError(previousFailureMessage, {
          statusCode: 422,
          attemptCount,
          maxAttempts,
          engine: input.engine,
          failureStage,
          rawResponsePreview: previousRawResponse?.slice(0, 600) ?? null,
        });
      }
    }
  }

  throw new ArtPieceGenerationError("Piece generation exhausted its attempt budget.", {
    statusCode: 422,
    attemptCount: maxAttempts,
    maxAttempts,
    engine: input.engine,
    failureStage: "attempt_budget_exhausted",
    rawResponsePreview: previousRawResponse?.slice(0, 600) ?? null,
  });
}

router.get("/art-pieces", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const pieces = await loadPiecesWithVersions(req.currentUser!.id);
    return res.json({ pieces });
  } catch (error) {
    console.error("Failed to list art pieces:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/art-pieces/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const params = PieceIdParams.safeParse(req.params);
    if (!params.success) {
      return res.status(404).json({ error: "Not found" });
    }

    const piece = await loadPieceOwnedByUser(params.data.id, req.currentUser!.id);
    if (!piece) {
      return res.status(404).json({ error: "Not found" });
    }
    const currentVersion = piece.currentVersionId ? await loadVersionById(piece.currentVersionId) : null;
    const versions = await db
      .select()
      .from(artPieceVersionsTable)
      .where(eq(artPieceVersionsTable.artPieceId, piece.id))
      .orderBy(desc(artPieceVersionsTable.createdAt));

    return res.json({
      ...serializeArtPiece(piece, currentVersion),
      versions: versions.map(serializeArtPieceVersion),
    });
  } catch (error) {
    console.error("Failed to get art piece:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/art-pieces/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const params = PieceIdParams.safeParse(req.params);
    if (!params.success) {
      return res.status(404).json({ error: "Not found" });
    }

    const pieceRows = await db
      .select()
      .from(artPiecesTable)
      .where(eq(artPiecesTable.id, params.data.id))
      .limit(1);
    const piece = pieceRows[0] ?? null;
    if (!piece) {
      return res.status(404).json({ error: "Not found" });
    }
    if (piece.ownerUserId !== req.currentUser!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await db.delete(artPiecesTable).where(eq(artPiecesTable.id, params.data.id));
    return res.status(204).send();
  } catch (err) {
    return res.status(400).json({ error: "Invalid request" });
  }
});

router.get("/art-pieces/:id/embed", async (req: Request, res: Response) => {
  try {
    const params = PieceIdParams.safeParse(req.params);
    const query = PieceEmbedQuery.safeParse(req.query);
    if (!params.success || !query.success) {
      return res.status(404).json({ error: "Not found" });
    }

    const pieceRows = await db
      .select()
      .from(artPiecesTable)
      .where(eq(artPiecesTable.id, params.data.id))
      .limit(1);
    const piece = pieceRows[0] ?? null;
    if (!piece) {
      return res.status(404).json({ error: "Not found" });
    }

    const versionId = query.data.version ?? piece.currentVersionId;
    if (!versionId) {
      return res.status(404).json({ error: "Not found" });
    }

    const version = await loadVersionById(versionId);
    if (!version || version.artPieceId !== piece.id) {
      return res.status(404).json({ error: "Not found" });
    }

    return res.json({
      id: piece.id,
      title: piece.title,
      engine: piece.engine,
      version: serializeArtPieceVersion(version),
    });
  } catch (error) {
    console.error("Failed to get embed art piece:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/art-pieces/generate", requireAuth, requireOwner, async (req: Request, res: Response) => {
  const generation = createGenerationAbortController(req);

  try {
    const parsed = GenerateArtPieceBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const rows = await loadOwnerAiSettings(req.currentUser!.id);
    const selected = rows.find((row) => row.vendor === parsed.data.vendor);
    const model = normalizeOptionalString(selected?.model);
    const encryptedApiKey = normalizeOptionalString(selected?.encryptedApiKey);

    if (selected?.enabled !== 1 || !model || !encryptedApiKey) {
      return res.status(409).json({
        error: `${getAiVendorLabel(parsed.data.vendor) ?? "Selected AI vendor"} is not enabled and configured for this user`,
      });
    }

    const apiKey = decryptAiApiKey(encryptedApiKey);
    const draft = await generateValidatedDraft({
      ownerUserId: req.currentUser!.id,
      prompt: parsed.data.prompt,
      engine: parsed.data.engine,
      vendor: parsed.data.vendor,
      model,
      apiKey,
      signal: generation.signal,
    });

    return res.json(draft);
  } catch (error) {
    if (error instanceof ArtPieceGenerationError) {
      return res.status(error.statusCode).json({
        error: error.message,
        engine: error.engine,
        failureStage: error.failureStage,
        rawResponsePreview: error.rawResponsePreview,
        attemptCount: error.attemptCount,
        maxAttempts: error.maxAttempts,
        timedOut: error.timedOut,
        cancelled: error.cancelled,
      });
    }
    if (error instanceof AiProviderError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Server error" });
  } finally {
    generation.cleanup();
  }
});

router.post("/art-pieces", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const parsed = CreateArtPieceBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const draft = consumeValidatedDraftToken(parsed.data.draftToken, req.currentUser!.id);
    if (!draft) {
      return res.status(409).json({
        error: "This validated draft is no longer available. Generate the piece again before saving.",
      });
    }

    const engine = validateArtPieceEngine(draft.engine);
    if (!engine) {
      return res.status(400).json({ error: "Unsupported art piece engine" });
    }

    const now = new Date().toISOString().slice(0, 23).replace("T", " ");

    const insertPiece = await db
      .insert(artPiecesTable)
      .values({
        ownerUserId: req.currentUser!.id,
        title: draft.title,
        prompt: draft.prompt,
        engine,
        status: "active",
        thumbnailUrl: parsed.data.thumbnailUrl,
        createdAt: now,
        updatedAt: now,
      })
      .$returningId();

    const pieceId = insertPiece[0]?.id;
    if (!pieceId) {
      return res.status(500).json({ error: "Failed to create art piece" });
    }

    const insertVersion = await db
      .insert(artPieceVersionsTable)
      .values({
        artPieceId: pieceId,
        prompt: draft.prompt,
        structuredSpec: JSON.stringify(draft.structuredSpec),
        generatedCode: draft.generatedCode,
        engine,
        generationVendor: draft.generationVendor,
        generationModel: draft.generationModel,
        validationStatus: draft.validationStatus,
        generationAttemptCount: draft.attemptCount,
        notes: draft.notes,
      })
      .$returningId();
    const versionId = insertVersion[0]?.id;

    if (!versionId) {
      return res.status(500).json({ error: "Failed to create art piece version" });
    }

    await mysqlPool.query(
      `UPDATE art_pieces
          SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?`,
      [versionId, pieceId],
    );

    const piece = await loadPieceOwnedByUser(pieceId, req.currentUser!.id);
    const version = await loadVersionById(versionId);
    if (!piece || !version) {
      return res.status(500).json({ error: "Failed to load created art piece" });
    }

    return res.status(201).json({
      ...serializeArtPiece(piece, version),
      iframeHtml: buildInteractivePieceIframeHtml({
        origin: `${req.protocol}://${req.get("host") ?? ""}`,
        pieceId,
        versionId,
        title: piece.title,
      }),
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch("/art-pieces/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const params = PieceIdParams.safeParse(req.params);
    const parsed = UpdateArtPieceBody.safeParse(req.body);
    if (!params.success) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const piece = await loadPieceOwnedByUser(params.data.id, req.currentUser!.id);
    if (!piece) {
      return res.status(404).json({ error: "Not found" });
    }

    const updates: Partial<ArtPiece> = {};
    if (typeof parsed.data.title === "string") {
      updates.title = parsed.data.title;
    }
    if (typeof parsed.data.prompt === "string") {
      updates.prompt = parsed.data.prompt;
    }
    if (typeof parsed.data.status === "string") {
      const status = validateArtPieceStatus(parsed.data.status);
      if (!status) {
        return res.status(400).json({ error: "Unsupported art piece status" });
      }
      updates.status = status;
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "thumbnailUrl")) {
      updates.thumbnailUrl = parsed.data.thumbnailUrl ?? null;
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString().slice(0, 23).replace("T", " ");
      await db.update(artPiecesTable).set(updates).where(eq(artPiecesTable.id, piece.id));
    }

    const nextPiece = await loadPieceOwnedByUser(piece.id, req.currentUser!.id);
    const currentVersion = nextPiece?.currentVersionId ? await loadVersionById(nextPiece.currentVersionId) : null;
    if (!nextPiece) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.json(serializeArtPiece(nextPiece, currentVersion));
  } catch (error) {
    console.error("Failed to update art piece:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/art-pieces/:id/versions", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const params = PieceIdParams.safeParse(req.params);
    const parsed = CreateArtPieceVersionBody.safeParse(req.body);
    if (!params.success) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const piece = await loadPieceOwnedByUser(params.data.id, req.currentUser!.id);
    if (!piece) {
      return res.status(404).json({ error: "Not found" });
    }

    const draft = consumeValidatedDraftToken(parsed.data.draftToken, req.currentUser!.id);
    if (!draft) {
      return res.status(409).json({
        error: "This validated draft is no longer available. Generate the piece again before saving.",
      });
    }

    const engine = validateArtPieceEngine(draft.engine);
    if (!engine) {
      return res.status(400).json({ error: "Unsupported art piece engine" });
    }

    const versionInsert = await db
      .insert(artPieceVersionsTable)
      .values({
        artPieceId: piece.id,
        prompt: draft.prompt,
        structuredSpec: JSON.stringify(draft.structuredSpec),
        generatedCode: draft.generatedCode,
        engine,
        generationVendor: draft.generationVendor,
        generationModel: draft.generationModel,
        validationStatus: draft.validationStatus,
        generationAttemptCount: draft.attemptCount,
        notes: draft.notes,
      })
      .$returningId();

    const versionId = versionInsert[0]?.id;
    if (!versionId) {
      return res.status(500).json({ error: "Failed to create art piece version" });
    }

    const shouldMakeCurrent = parsed.data.makeCurrent !== false;
    const updates: Partial<ArtPiece> = {
      updatedAt: new Date().toISOString().slice(0, 23).replace("T", " "),
      prompt: draft.prompt,
    };
    if (typeof parsed.data.title === "string") {
      updates.title = parsed.data.title;
    }
    if (shouldMakeCurrent) {
      updates.currentVersionId = versionId;
      updates.engine = engine;
    }

    await db.update(artPiecesTable).set(updates).where(eq(artPiecesTable.id, piece.id));

    const version = await loadVersionById(versionId);
    const nextPiece = await loadPieceOwnedByUser(piece.id, req.currentUser!.id);
    if (!version || !nextPiece) {
      return res.status(500).json({ error: "Failed to load saved art piece version" });
    }

    return res.status(201).json({
      piece: serializeArtPiece(
        nextPiece,
        nextPiece.currentVersionId ? await loadVersionById(nextPiece.currentVersionId) : null,
      ),
      version: serializeArtPieceVersion(version),
      iframeHtml: buildInteractivePieceIframeHtml({
        origin: `${req.protocol}://${req.get("host") ?? ""}`,
        pieceId: nextPiece.id,
        versionId: version.id,
        title: nextPiece.title,
      }),
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
