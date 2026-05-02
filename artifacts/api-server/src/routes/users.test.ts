import { describe, expect, it } from "vitest";
import { UpdateMeBody } from "@workspace/api-zod";
import {
  THEME_FIELD_KEYS,
  buildThemeUpdateSet,
  parseSocialLinks,
  pickThemeFields,
} from "./users";

/**
 * Round-trip coverage for the per-user theme contract on /users/me:
 *
 *   - PATCH validation (UpdateMeBody): the API gate that any payload
 *     hits before reaching the DB writer.
 *   - buildThemeUpdateSet: the merge rule that keeps a profile-info
 *     save (no theme keys) from wiping a user's saved theme.
 *   - pickThemeFields: the read-side projection that exposes all 16
 *     theme fields on GET responses.
 */

describe("PATCH /users/me — UpdateMeBody contract", () => {
  it("accepts a full theme payload (theme + palette + 14 colors)", () => {
    const result = UpdateMeBody.safeParse({
      theme: "nature",
      palette: "forest",
      colorBackground: "200 100% 90%",
      colorForeground: "200 30% 10%",
      colorBackgroundDark: "200 30% 10%",
      colorForegroundDark: "200 100% 90%",
      colorPrimary: "180 60% 40%",
      colorPrimaryForeground: "0 0% 100%",
      colorSecondary: "120 40% 50%",
      colorSecondaryForeground: "0 0% 0%",
      colorAccent: "60 80% 60%",
      colorAccentForeground: "0 0% 0%",
      colorMuted: "200 10% 95%",
      colorMutedForeground: "200 10% 30%",
      colorDestructive: "0 80% 50%",
      colorDestructiveForeground: "0 0% 100%",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty body (profile-info save with no theme keys)", () => {
    const result = UpdateMeBody.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a profile-info-only body (no theme keys)", () => {
    const result = UpdateMeBody.safeParse({ bio: "hello", website: "https://example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects a stored-XSS attempt in a color field", () => {
    const result = UpdateMeBody.safeParse({
      colorBackground: "</style><script>alert(1)</script>",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-HSL color value", () => {
    const result = UpdateMeBody.safeParse({ colorPrimary: "red" });
    expect(result.success).toBe(false);
  });

  it("rejects an oversized color value (>32 chars)", () => {
    const giant = "1 ".repeat(50) + "100% 50%";
    const result = UpdateMeBody.safeParse({ colorBackground: giant });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown theme id", () => {
    const result = UpdateMeBody.safeParse({ theme: "not-a-real-theme" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown palette id", () => {
    const result = UpdateMeBody.safeParse({ palette: "not-a-real-palette" });
    expect(result.success).toBe(false);
  });

  it("accepts explicit null for every theme column (clear-customization payload)", () => {
    // The "Clear my customization" action sends null for all 16 theme
    // columns at once so the user's row reverts to inheriting the site
    // theme.
    const result = UpdateMeBody.safeParse({
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
    });
    expect(result.success).toBe(true);
  });

  it("accepts a single explicit null on one theme column", () => {
    // Defense: a partial clear (just one column) is well-formed even
    // though the UI always sends the full set.
    const result = UpdateMeBody.safeParse({ colorPrimary: null });
    expect(result.success).toBe(true);
  });
});

describe("PATCH /users/me — buildThemeUpdateSet (preserve-on-partial-save)", () => {
  it("returns an empty set when the body has no theme keys", () => {
    expect(buildThemeUpdateSet({})).toEqual({});
  });

  it("includes only the theme keys the client explicitly sent", () => {
    const set = buildThemeUpdateSet({
      theme: "nature",
      colorBackground: "200 100% 90%",
    });
    expect(set).toEqual({
      theme: "nature",
      colorBackground: "200 100% 90%",
    });
    // Nothing else gets written. A SQL UPDATE with this set leaves the
    // user's other 14 theme columns untouched.
    expect(Object.keys(set).sort()).toEqual(["colorBackground", "theme"]);
  });

  it("ignores non-string values on its input (defense-in-depth)", () => {
    const set = buildThemeUpdateSet({
      theme: undefined,
      colorBackground: "200 100% 90%",
      // @ts-expect-error — testing runtime defensiveness
      colorPrimary: 42,
    });
    expect(set).toEqual({ colorBackground: "200 100% 90%" });
  });

  it("supports a full save with all 16 theme keys", () => {
    const full = Object.fromEntries(
      THEME_FIELD_KEYS.map((k) => [k, k === "theme" ? "nature" : k === "palette" ? "forest" : "200 100% 90%"]),
    ) as Partial<Record<(typeof THEME_FIELD_KEYS)[number], string>>;
    const set = buildThemeUpdateSet(full);
    expect(Object.keys(set).sort()).toEqual([...THEME_FIELD_KEYS].sort());
  });

  it("passes through explicit null on every theme column (clear-customization)", () => {
    // The "Clear my customization" UI sends `null` for all 16 theme
    // columns. Drizzle treats null in `.set()` as a SQL NULL write, so
    // the user's row reverts to inheriting the site theme.
    const allNull = Object.fromEntries(
      THEME_FIELD_KEYS.map((k) => [k, null]),
    ) as Partial<Record<(typeof THEME_FIELD_KEYS)[number], string | null>>;
    const set = buildThemeUpdateSet(allNull);
    expect(Object.keys(set).sort()).toEqual([...THEME_FIELD_KEYS].sort());
    for (const key of THEME_FIELD_KEYS) {
      expect(set[key]).toBeNull();
    }
  });

  it("mixes explicit null and string values in the same set", () => {
    const set = buildThemeUpdateSet({
      theme: null,
      palette: "forest",
      colorPrimary: null,
      colorBackground: "200 100% 90%",
    });
    expect(set).toEqual({
      theme: null,
      palette: "forest",
      colorPrimary: null,
      colorBackground: "200 100% 90%",
    });
  });

  it("treats undefined (key absent) as 'not sent' even when other keys are null", () => {
    // Only the keys actually present on the body are written. An absent
    // key keeps the user's existing column value.
    const set = buildThemeUpdateSet({
      theme: null,
      colorPrimary: undefined,
    });
    expect(set).toEqual({ theme: null });
  });
});

describe("GET /users/me, GET /users/:id — pickThemeFields (read-side projection)", () => {
  it("returns null for every theme field when the user has no customization", () => {
    const projected = pickThemeFields({
      // shape of usersTable.$inferSelect, only the bits we need
    } as unknown as Parameters<typeof pickThemeFields>[0]);
    expect(Object.keys(projected).sort()).toEqual([...THEME_FIELD_KEYS].sort());
    for (const key of THEME_FIELD_KEYS) {
      expect(projected[key]).toBeNull();
    }
  });

  it("passes through theme fields that the user has set", () => {
    const projected = pickThemeFields({
      theme: "nature",
      palette: "forest",
      colorBackground: "200 100% 90%",
      colorPrimary: "180 60% 40%",
    } as unknown as Parameters<typeof pickThemeFields>[0]);
    expect(projected.theme).toBe("nature");
    expect(projected.palette).toBe("forest");
    expect(projected.colorBackground).toBe("200 100% 90%");
    expect(projected.colorPrimary).toBe("180 60% 40%");
    // Untouched fields stay null.
    expect(projected.colorAccent).toBeNull();
    expect(projected.colorDestructive).toBeNull();
  });

  it("normalizes undefined to null (so the API never returns undefined)", () => {
    const projected = pickThemeFields({
      theme: undefined,
      colorBackground: undefined,
    } as unknown as Parameters<typeof pickThemeFields>[0]);
    expect(projected.theme).toBeNull();
    expect(projected.colorBackground).toBeNull();
  });
});

describe("parseSocialLinks", () => {
  it("returns null for falsy values", () => {
    expect(parseSocialLinks(null)).toBeNull();
    expect(parseSocialLinks(undefined)).toBeNull();
    expect(parseSocialLinks("")).toBeNull();
  });

  it("parses a JSON string", () => {
    expect(parseSocialLinks('{"twitter":"https://x.com/x"}')).toEqual({
      twitter: "https://x.com/x",
    });
  });

  it("returns an already-parsed object as-is", () => {
    const obj = { twitter: "https://x.com/x" };
    expect(parseSocialLinks(obj)).toEqual(obj);
  });

  it("returns null for an unparsable JSON string", () => {
    expect(parseSocialLinks("not-json")).toBeNull();
  });
});
