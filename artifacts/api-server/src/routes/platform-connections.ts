import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  mysqlPool,
  platformConnectionsTable,
  postSyndicationsTable,
  eq,
  and,
  formatMysqlDateTime,
  type PlatformConnection,
} from "@workspace/db";
import { requireAuth, requireOwner } from "../middlewares/auth";
import { encryptSecret } from "../lib/crypto";

const router: IRouter = Router();

// Platforms that use OAuth — connection created by the OAuth callback route.
const OAUTH_PLATFORMS = new Set(["wordpress_com", "blogger"]);
// Platforms that store credentials submitted via this endpoint.
// Medium uses a self-integration token (OAuth API deprecated for new apps).
const CREDENTIAL_PLATFORMS = new Set(["wordpress_self", "medium"]);
const ALL_PLATFORMS = new Set([...OAUTH_PLATFORMS, ...CREDENTIAL_PLATFORMS]);

function serializeConnection(row: PlatformConnection) {
  return {
    id: row.id,
    platform: row.platform,
    configured: Boolean(row.encryptedAccessToken),
    enabled: row.enabled === 1,
    metadata: row.metadata,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /platform-connections
router.get("/platform-connections", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(platformConnectionsTable)
      .where(eq(platformConnectionsTable.userId, req.currentUser!.id));
    return res.json({ connections: rows.map(serializeConnection) });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /platform-connections/:id/syndications
router.get("/platform-connections/:id/syndications", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const connectionId = Number(req.params.id);
    if (!Number.isInteger(connectionId) || connectionId < 1) {
      return res.status(400).json({ error: "Invalid connection id" });
    }

    const [conn] = await db
      .select()
      .from(platformConnectionsTable)
      .where(
        and(
          eq(platformConnectionsTable.id, connectionId),
          eq(platformConnectionsTable.userId, req.currentUser!.id),
        ),
      )
      .limit(1);

    if (!conn) return res.status(404).json({ error: "Not found" });

    const syndications = await db
      .select()
      .from(postSyndicationsTable)
      .where(eq(postSyndicationsTable.platformConnectionId, connectionId));

    return res.json({ syndications });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

const CreatePlatformConnectionBodySchema = z.object({
  platform: z.string().min(1),
  credentials: z.object({
    siteUrl: z.string().url().optional(),
    username: z.string().optional(),
    appPassword: z.string().optional(),
    token: z.string().optional(),
  }).optional(),
});

// POST /platform-connections
// Used for credential-based platforms (wordpress_self, medium).
// OAuth-based platforms (wordpress_com, blogger) create their connection
// via the OAuth callback route at /api/platform-oauth/{platform}/start.
router.post("/platform-connections", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const parsed = CreatePlatformConnectionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.format() });
    }

    const { platform, credentials } = parsed.data;

    if (!ALL_PLATFORMS.has(platform)) {
      return res.status(400).json({ error: `Unsupported platform: ${platform}` });
    }

    if (OAUTH_PLATFORMS.has(platform)) {
      return res.status(400).json({
        error: `${platform} uses OAuth. Use /api/platform-oauth/${platform.replace(/_/g, "-")}/start.`,
      });
    }

    const now = formatMysqlDateTime(new Date());

    if (platform === "wordpress_self") {
      const { siteUrl, username, appPassword } = credentials ?? {};
      if (!siteUrl) {
        return res.status(400).json({ error: "Site URL is required (must start with https:// or http://)" });
      }
      if (!username) {
        return res.status(400).json({ error: "Username is required" });
      }
      if (!appPassword) {
        return res.status(400).json({ error: "Application Password is required" });
      }

      const basicCredential = Buffer.from(`${username}:${appPassword}`).toString("base64");
      const encryptedAccessToken = encryptSecret(basicCredential);
      const metadata = { siteUrl };

      await mysqlPool.query(
        `INSERT INTO platform_connections
           (user_id, platform, encrypted_access_token, metadata, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
           encrypted_access_token = VALUES(encrypted_access_token),
           metadata = VALUES(metadata),
           updated_at = VALUES(updated_at)`,
        [req.currentUser!.id, platform, encryptedAccessToken, JSON.stringify(metadata), now, now],
      );
    }

    if (platform === "medium") {
      const { token } = credentials ?? {};
      if (!token) {
        return res.status(400).json({ error: "medium requires credentials.token (self-integration token)" });
      }

      // Fetch the Medium author ID so the syndication adapter can publish.
      let authorId: string;
      try {
        const meRes = await fetch("https://api.medium.com/v1/me", {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!meRes.ok) {
          return res.status(400).json({ error: `Medium token verification failed (${meRes.status}). Check the token and try again.` });
        }
        const me = (await meRes.json()) as { data: { id: string } };
        authorId = me.data.id;
      } catch {
        return res.status(502).json({ error: "Could not reach Medium to verify token. Try again." });
      }

      const encryptedAccessToken = encryptSecret(token);
      const metadata = { authorId };

      await mysqlPool.query(
        `INSERT INTO platform_connections
           (user_id, platform, encrypted_access_token, metadata, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
           encrypted_access_token = VALUES(encrypted_access_token),
           metadata = VALUES(metadata),
           updated_at = VALUES(updated_at)`,
        [req.currentUser!.id, platform, encryptedAccessToken, JSON.stringify(metadata), now, now],
      );
    }

    const [row] = await db
      .select()
      .from(platformConnectionsTable)
      .where(
        and(
          eq(platformConnectionsTable.userId, req.currentUser!.id),
          eq(platformConnectionsTable.platform, platform),
        ),
      )
      .limit(1);

    return res.status(row ? 200 : 201).json(row ? serializeConnection(row) : {});
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

const PatchPlatformConnectionBodySchema = z.object({
  enabled: z.boolean().optional(),
});

// PATCH /platform-connections/:id
router.patch("/platform-connections/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const connectionId = Number(req.params.id);
    if (!Number.isInteger(connectionId) || connectionId < 1) {
      return res.status(400).json({ error: "Invalid connection id" });
    }

    const parsed = PatchPlatformConnectionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.format() });
    }

    const [conn] = await db
      .select()
      .from(platformConnectionsTable)
      .where(
        and(
          eq(platformConnectionsTable.id, connectionId),
          eq(platformConnectionsTable.userId, req.currentUser!.id),
        ),
      )
      .limit(1);

    if (!conn) return res.status(404).json({ error: "Not found" });

    const patch: Partial<typeof platformConnectionsTable.$inferInsert> = {
      updatedAt: formatMysqlDateTime(new Date()),
    };

    if (typeof parsed.data.enabled === "boolean") {
      patch.enabled = parsed.data.enabled ? 1 : 0;
    }

    await db
      .update(platformConnectionsTable)
      .set(patch)
      .where(eq(platformConnectionsTable.id, connectionId));

    const [updated] = await db
      .select()
      .from(platformConnectionsTable)
      .where(eq(platformConnectionsTable.id, connectionId))
      .limit(1);

    return res.json(serializeConnection(updated!));
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

// DELETE /platform-connections/:id — soft disconnect: clears access tokens
// but keeps the row so the user can reconnect without re-entering credentials.
router.delete("/platform-connections/:id", requireAuth, requireOwner, async (req: Request, res: Response) => {
  try {
    const connectionId = Number(req.params.id);
    if (!Number.isInteger(connectionId) || connectionId < 1) {
      return res.status(400).json({ error: "Invalid connection id" });
    }

    const [conn] = await db
      .select()
      .from(platformConnectionsTable)
      .where(
        and(
          eq(platformConnectionsTable.id, connectionId),
          eq(platformConnectionsTable.userId, req.currentUser!.id),
        ),
      )
      .limit(1);

    if (!conn) return res.status(404).json({ error: "Not found" });

    await db
      .update(platformConnectionsTable)
      .set({
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        expiresAt: null,
        updatedAt: formatMysqlDateTime(new Date()),
      })
      .where(eq(platformConnectionsTable.id, connectionId));

    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
