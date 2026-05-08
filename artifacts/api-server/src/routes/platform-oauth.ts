import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import {
  db,
  mysqlPool,
  platformConnectionsTable,
  platformOAuthAppsTable,
  eq,
  and,
  formatMysqlDateTime,
} from "@workspace/db";
import { requireAuth, requireOwner } from "../middlewares/auth";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { getOrigin } from "./feeds";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Server-side OAuth state store. Keyed by the random state token; value is
// the expiry timestamp. Consumed on first use so each token is one-shot.
const oauthStateStore = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function generateState(): string {
  const state = crypto.randomBytes(16).toString("hex");
  oauthStateStore.set(state, Date.now() + STATE_TTL_MS);
  setTimeout(() => oauthStateStore.delete(state), STATE_TTL_MS);
  return state;
}

function verifyState(req: Request): boolean {
  const paramState = req.query.state as string | undefined;
  if (!paramState) return false;
  const expiry = oauthStateStore.get(paramState);
  oauthStateStore.delete(paramState);
  return expiry !== undefined && Date.now() <= expiry;
}

// Resolve OAuth app credentials: env var takes priority, then DB.
async function getAppCredentials(
  platform: string,
  envClientId: string | undefined,
  envClientSecret: string | undefined,
): Promise<{ clientId: string; clientSecret: string } | null> {
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }
  const [app] = await db
    .select()
    .from(platformOAuthAppsTable)
    .where(eq(platformOAuthAppsTable.platform, platform))
    .limit(1);
  if (app?.encryptedClientId && app?.encryptedClientSecret) {
    return {
      clientId: decryptSecret(app.encryptedClientId),
      clientSecret: decryptSecret(app.encryptedClientSecret),
    };
  }
  return null;
}

async function upsertConnection(
  userId: string,
  platform: string,
  encryptedAccessToken: string,
  encryptedRefreshToken: string | null,
  expiresAt: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  const now = formatMysqlDateTime(new Date());
  await mysqlPool.query(
    `INSERT INTO platform_connections
       (user_id, platform, encrypted_access_token, encrypted_refresh_token,
        expires_at, metadata, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON DUPLICATE KEY UPDATE
       encrypted_access_token = VALUES(encrypted_access_token),
       encrypted_refresh_token = VALUES(encrypted_refresh_token),
       expires_at = VALUES(expires_at),
       metadata = VALUES(metadata),
       updated_at = VALUES(updated_at)`,
    [userId, platform, encryptedAccessToken, encryptedRefreshToken, expiresAt, JSON.stringify(metadata), now, now],
  );
}

// ─── WordPress.com ────────────────────────────────────────────────────────────

// GET /platform-oauth/wordpress-com/start
router.get("/platform-oauth/wordpress-com/start", requireAuth, requireOwner, async (req: Request, res: Response) => {
  const creds = await getAppCredentials("wordpress_com", process.env.WORDPRESS_COM_CLIENT_ID, process.env.WORDPRESS_COM_CLIENT_SECRET);
  if (!creds) {
    return res.status(503).json({
      error: "WordPress.com OAuth app not configured. Enter your Client ID and Secret in Admin → Platforms.",
    });
  }

  const origin = getOrigin(req);
  const redirectUri = `${origin}/api/platform-oauth/wordpress-com/callback`;
  const state = generateState();

  const url = new URL("https://public-api.wordpress.com/oauth2/authorize");
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "posts");
  url.searchParams.set("state", state);

  return res.redirect(url.toString());
});

// GET /platform-oauth/wordpress-com/callback
router.get("/platform-oauth/wordpress-com/callback", requireAuth, requireOwner, async (req: Request, res: Response) => {
  if (!verifyState(req)) {
    return res.status(400).send("Invalid OAuth state. Please try connecting again.");
  }

  const code = req.query.code as string | undefined;
  if (!code) {
    return res.redirect("/admin/platforms?error=wordpress_com_denied");
  }

  try {
    const creds = await getAppCredentials("wordpress_com", process.env.WORDPRESS_COM_CLIENT_ID, process.env.WORDPRESS_COM_CLIENT_SECRET);
    if (!creds) {
      return res.redirect("/admin/platforms?error=wordpress_com_not_configured");
    }

    const origin = getOrigin(req);
    const redirectUri = `${origin}/api/platform-oauth/wordpress-com/callback`;

    const tokenRes = await fetch("https://public-api.wordpress.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      blog_id?: string | number;
    };

    let blogId = tokens.blog_id ? String(tokens.blog_id) : null;
    let blogUrl: string | null = null;

    if (!blogId) {
      const meRes = await fetch("https://public-api.wordpress.com/rest/v1.1/sites/mine", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const me = (await meRes.json()) as { ID?: number; URL?: string };
        blogId = me.ID ? String(me.ID) : null;
        blogUrl = me.URL ?? null;
      }
    }

    const expiresAt = tokens.expires_in
      ? formatMysqlDateTime(new Date(Date.now() + tokens.expires_in * 1000))
      : null;

    await upsertConnection(
      req.currentUser!.id,
      "wordpress_com",
      encryptSecret(tokens.access_token),
      tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      expiresAt,
      { blogId, blogUrl },
    );

    return res.redirect("/admin/platforms?connected=wordpress_com");
  } catch (err) {
    logger.error({ err }, "WordPress.com OAuth callback error");
    return res.redirect("/admin/platforms?error=wordpress_com_failed");
  }
});

// ─── Blogger (Google OAuth with blogger scope) ────────────────────────────────

// GET /platform-oauth/blogger/start
router.get("/platform-oauth/blogger/start", requireAuth, requireOwner, async (req: Request, res: Response) => {
  const creds = await getAppCredentials("blogger", process.env.BLOGGER_GOOGLE_CLIENT_ID, process.env.BLOGGER_GOOGLE_CLIENT_SECRET);
  if (!creds) {
    return res.status(503).json({
      error: "Blogger OAuth app not configured. Enter your Client ID and Secret in Admin → Platforms.",
    });
  }

  const origin = getOrigin(req);
  const redirectUri = `${origin}/api/platform-oauth/blogger/callback`;
  const state = generateState();

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/blogger");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return res.redirect(url.toString());
});

// GET /platform-oauth/blogger/callback
router.get("/platform-oauth/blogger/callback", requireAuth, requireOwner, async (req: Request, res: Response) => {
  if (!verifyState(req)) {
    return res.status(400).send("Invalid OAuth state. Please try connecting again.");
  }

  const code = req.query.code as string | undefined;
  if (!code) {
    return res.redirect("/admin/platforms?error=blogger_denied");
  }

  try {
    const creds = await getAppCredentials("blogger", process.env.BLOGGER_GOOGLE_CLIENT_ID, process.env.BLOGGER_GOOGLE_CLIENT_SECRET);
    if (!creds) {
      return res.redirect("/admin/platforms?error=blogger_not_configured");
    }

    const origin = getOrigin(req);
    const redirectUri = `${origin}/api/platform-oauth/blogger/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error(`Blogger token exchange failed: ${tokenRes.status}`);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const blogsRes = await fetch(
      "https://www.googleapis.com/blogger/v3/users/self/blogs",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );

    let blogId: string | null = null;
    let blogUrl: string | null = null;

    if (blogsRes.ok) {
      const blogs = (await blogsRes.json()) as {
        items?: Array<{ id: string; url: string; name: string }>;
      };
      const first = blogs.items?.[0];
      if (first) {
        blogId = first.id;
        blogUrl = first.url;
      }
    }

    const expiresAt = tokens.expires_in
      ? formatMysqlDateTime(new Date(Date.now() + tokens.expires_in * 1000))
      : null;

    await upsertConnection(
      req.currentUser!.id,
      "blogger",
      encryptSecret(tokens.access_token),
      tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      expiresAt,
      { blogId, blogUrl },
    );

    return res.redirect("/admin/platforms?connected=blogger");
  } catch (err) {
    logger.error({ err }, "Blogger OAuth callback error");
    return res.redirect("/admin/platforms?error=blogger_failed");
  }
});

export default router;
