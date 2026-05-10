import { Router, type IRouter, type Request, type Response } from "express";
import { db, postsTable, usersTable, feedSourcesTable, eq, count, and, ne, isNull, formatMysqlDateTime } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { UpdateMeBody } from "@workspace/api-zod";

const router: IRouter = Router();

// Per-user theme columns we expose on read endpoints. Keep in sync with the
// theme columns added to `usersTable`.
export const THEME_FIELD_KEYS = [
  "theme",
  "palette",
  "colorBackground",
  "colorForeground",
  "colorBackgroundDark",
  "colorForegroundDark",
  "colorPrimary",
  "colorPrimaryForeground",
  "colorSecondary",
  "colorSecondaryForeground",
  "colorAccent",
  "colorAccentForeground",
  "colorMuted",
  "colorMutedForeground",
  "colorDestructive",
  "colorDestructiveForeground",
] as const;

export type ThemeFieldKey = typeof THEME_FIELD_KEYS[number];

type UserRow = typeof usersTable.$inferSelect;

export function pickThemeFields(user: UserRow): Record<ThemeFieldKey, string | null> {
  const out = {} as Record<ThemeFieldKey, string | null>;
  const rec = user as unknown as Record<ThemeFieldKey, string | null | undefined>;
  for (const key of THEME_FIELD_KEYS) {
    out[key] = rec[key] ?? null;
  }
  return out;
}

export function parseSocialLinks(val: unknown): Record<string, string> | null {
  if (!val) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as Record<string, string>;
    } catch {
      return null;
    }
  }
  if (typeof val === "object") return val as Record<string, string>;
  return null;
}

/**
 * Builds the per-row update payload for theme fields from a validated
 * PATCH /users/me body. Extracted so the "preserve theme on partial
 * save" rule can be exercised by tests without spinning up the full
 * route.
 *
 * Critically: ONLY keys the client explicitly sent (i.e. present on
 * `body` after Zod validation) are written. A profile-info save (no
 * theme keys at all) returns `{}`, so the SQL UPDATE never touches a
 * user's saved theme.
 *
 * Explicit `null` values are passed through so the client can clear a
 * theme column back to the site-wide default. `undefined` (key absent)
 * and other non-string values are ignored.
 */
export function buildThemeUpdateSet(
  body: Partial<Record<ThemeFieldKey, string | null>>,
): Partial<Record<ThemeFieldKey, string | null>> {
  const themeUpdate: Partial<Record<ThemeFieldKey, string | null>> = {};
  for (const key of THEME_FIELD_KEYS) {
    if (!(key in body)) continue;
    const value = body[key];
    if (typeof value === "string" || value === null) {
      themeUpdate[key] = value;
    }
  }
  return themeUpdate;
}

// GET /users/me
router.get("/users/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUser = req.currentUser!;
    const name = currentUser.name || currentUser.email || "Anonymous";
    const imageUrl = currentUser.image || null;

    const postCountResult = await db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.authorId, currentUser.id));

    const postCount = postCountResult[0]?.count ?? 0;

    return res.json({
      id: currentUser.id,
      name,
      username: currentUser.username || null,
      email: currentUser.email,
      imageUrl,
      bio: currentUser.bio || null,
      website: currentUser.website || null,
      socialLinks: parseSocialLinks(currentUser.socialLinks),
      role: currentUser.role,
      status: currentUser.status,
      postCount,
      ...pickThemeFields(currentUser),
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /users/:id
// Handles three ID shapes:
//   "feed:N"  → feed source profile (by numeric source id)
//   UUID      → human user profile (by id)
//   other     → try feed_sources.username first, then users.username
router.get("/users/:id", async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id as string;

    // --- Feed source profile via numeric id (feed:N) ---
    const feedNumericMatch = /^feed:(\d+)$/.exec(rawId);
    if (feedNumericMatch) {
      const sourceId = parseInt(feedNumericMatch[1], 10);
      const sourceResult = await db
        .select()
        .from(feedSourcesTable)
        .where(eq(feedSourcesTable.id, sourceId))
        .limit(1);
      const source = sourceResult[0];
      if (!source) return res.status(404).json({ error: "User not found" });
      return res.json(await buildFeedSourceProfile(source));
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);

    if (isUuid) {
      // --- Human user by UUID ---
      const result = await db.select().from(usersTable).where(eq(usersTable.id, rawId)).limit(1);
      const user = result[0];
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json(await buildHumanUserProfile(user));
    }

    // --- Slug: try feed_sources.username first, then users.username ---
    const feedBySlug = await db
      .select()
      .from(feedSourcesTable)
      .where(eq(feedSourcesTable.username, rawId))
      .limit(1);
    if (feedBySlug[0]) return res.json(await buildFeedSourceProfile(feedBySlug[0]));

    const userBySlug = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, rawId))
      .limit(1);
    if (userBySlug[0]) return res.json(await buildHumanUserProfile(userBySlug[0]));

    return res.status(404).json({ error: "User not found" });
  } catch (err) {
    console.error("Failed to fetch user:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

async function buildFeedSourceProfile(source: typeof feedSourcesTable.$inferSelect) {
  const postCountResult = await db
    .select({ count: count() })
    .from(postsTable)
    .where(and(eq(postsTable.sourceFeedId, source.id), isNull(postsTable.authorUserId)));
  const postCount = postCountResult[0]?.count ?? 0;
  return {
    id: `feed:${source.id}`,
    name: source.name,
    username: source.username ?? null,
    imageUrl: null,
    bio: source.bio ?? null,
    website: source.siteUrl ?? null,
    siteUrl: source.siteUrl ?? null,
    socialLinks: null,
    postCount,
    sourceType: "feed" as const,
    // Feed profiles have no theme customization — return nulls so the
    // frontend falls back to the site-wide theme transparently.
    theme: null,
    palette: null,
    colorBackground: null,
    colorForeground: null,
    colorBackgroundDark: null,
    colorForegroundDark: null,
    colorPrimary: null,
    colorPrimaryForeground: null,
    colorSecondary: null,
    colorSecondaryForeground: null,
    colorAccent: null,
    colorAccentForeground: null,
    colorMuted: null,
    colorMutedForeground: null,
    colorDestructive: null,
    colorDestructiveForeground: null,
  };
}

async function buildHumanUserProfile(user: typeof usersTable.$inferSelect) {
  const name = user.name || user.email || "Anonymous";
  const imageUrl = user.image || null;
  const postCountResult = await db
    .select({ count: count() })
    .from(postsTable)
    .where(eq(postsTable.authorId, user.id));
  const postCount = postCountResult[0]?.count ?? 0;
  return {
    id: user.id,
    name,
    username: user.username || null,
    imageUrl,
    bio: user.bio || null,
    website: user.website || null,
    siteUrl: null,
    socialLinks: parseSocialLinks(user.socialLinks),
    postCount,
    sourceType: null,
    ...pickThemeFields(user),
  };
}

// PATCH /users/me
router.patch("/users/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUser = req.currentUser!;
    const bodyResult = UpdateMeBody.safeParse(req.body);

    if (!bodyResult.success) {
      return res.status(400).json({ error: "Invalid request body", details: bodyResult.error.format() });
    }

    const { name: rawName, username, bio, website, socialLinks, ...themeFields } = bodyResult.data;
    const name = rawName?.trim();

    if (rawName !== undefined && !name) {
      return res.status(400).json({ error: "Display name is required" });
    }

    // Validate username uniqueness if it's being changed
    if (username && username !== currentUser.username) {
      const existingUser = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.username, username), ne(usersTable.id, currentUser.id)))
        .limit(1);

      if (existingUser.length > 0) {
        return res.status(400).json({ error: "Username is already taken" });
      }
    }

    // Build the update payload. Only include theme fields that the client
    // explicitly sent so a profile-info save (no theme keys) never wipes a
    // user's saved theme. Explicit `null` values are passed through to
    // clear a column back to the site-wide default.
    const themeUpdate = buildThemeUpdateSet(
      themeFields as Partial<Record<ThemeFieldKey, string | null>>,
    );

    await db
      .update(usersTable)
      .set({
        name: name ?? undefined,
        username: username ?? undefined,
        bio: bio ?? undefined,
        website: website ?? undefined,
        socialLinks: socialLinks ?? undefined,
        ...themeUpdate,
        updatedAt: formatMysqlDateTime(),
      })
      .where(eq(usersTable.id, currentUser.id));

    if (name) {
      await db
        .update(postsTable)
        .set({ authorName: name })
        .where(eq(postsTable.authorUserId, currentUser.id));
    }

    // Fetch updated user
    const updatedUserResult = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, currentUser.id))
      .limit(1);

    const updatedUser = updatedUserResult[0]!;
    const displayName = updatedUser.name || updatedUser.email || "Anonymous";
    const imageUrl = updatedUser.image || null;

    const postCountResult = await db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.authorId, updatedUser.id));

    const postCount = postCountResult[0]?.count ?? 0;

    return res.json({
      id: updatedUser.id,
      name: displayName,
      username: updatedUser.username || null,
      imageUrl,
      bio: updatedUser.bio || null,
      website: updatedUser.website || null,
      socialLinks: parseSocialLinks(updatedUser.socialLinks),
      postCount,
      ...pickThemeFields(updatedUser),
    });
  } catch (err) {
    console.error("Failed to update profile:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
