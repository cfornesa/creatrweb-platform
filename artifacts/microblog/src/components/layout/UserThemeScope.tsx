import { useMemo, type ReactNode } from "react";
import type { UserProfile } from "@workspace/api-client-react";
import { THEMES, type ThemeId } from "@/lib/site-themes";

const KNOWN_THEMES = new Set<string>(THEMES.map((t) => t.id));

/**
 * Strict HSL token format: `<h> <s>% <l>%`. Mirrors the OpenAPI pattern
 * applied to every color column in `UpdateUserProfileBody` so client and
 * server agree on the only legal shape of these values. Used as
 * defense-in-depth before interpolating user-controlled values into a
 * `<style>` tag.
 */
const HSL_PATTERN = /^[0-9]{1,3}(\.[0-9]+)? [0-9]{1,3}(\.[0-9]+)?% [0-9]{1,3}(\.[0-9]+)?%$/;

function safeHsl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > 32) return null;
  return HSL_PATTERN.test(value) ? value : null;
}

function safeScopeKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  // Allow only the safe subset that matches what the server publishes.
  if (!/^user-[a-zA-Z0-9_-]+$/.test(value)) return null;
  return value;
}

function safeTheme(value: unknown): ThemeId | null {
  return typeof value === "string" && KNOWN_THEMES.has(value)
    ? (value as ThemeId)
    : null;
}

/**
 * Reads the server-emitted first-paint bootstrap, if any. The
 * `injectUserTheme` server-side helper sets:
 *   `window.__USER_THEME_BOOTSTRAP__ = {scopeKey, theme}`
 * for `/users/:handle` requests. Letting the wrapper render with these
 * values from frame 1 means the head-injected `<style>` matches before
 * the React Query fetch resolves — the actual no-flash piece.
 */
function readBootstrap(): { scopeKey: string; theme: ThemeId | null } | null {
  if (typeof window === "undefined") return null;
  const raw = (window as unknown as { __USER_THEME_BOOTSTRAP__?: unknown })
    .__USER_THEME_BOOTSTRAP__;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { scopeKey?: unknown; theme?: unknown };
  const scopeKey = safeScopeKey(obj.scopeKey);
  if (!scopeKey) return null;
  return { scopeKey, theme: safeTheme(obj.theme) };
}

interface UserThemeScopeProps {
  user: UserProfile | undefined;
  children: ReactNode;
}

const COLOR_KEY_TO_VAR: Array<[keyof UserProfile, string]> = [
  ["colorBackground", "--background"],
  ["colorForeground", "--foreground"],
  ["colorPrimary", "--primary"],
  ["colorPrimaryForeground", "--primary-foreground"],
  ["colorSecondary", "--secondary"],
  ["colorSecondaryForeground", "--secondary-foreground"],
  ["colorAccent", "--accent"],
  ["colorAccentForeground", "--accent-foreground"],
  ["colorMuted", "--muted"],
  ["colorMutedForeground", "--muted-foreground"],
  ["colorDestructive", "--destructive"],
  ["colorDestructiveForeground", "--destructive-foreground"],
];

const DARK_COLOR_KEY_TO_VAR: Array<[keyof UserProfile, string]> = [
  ["colorBackgroundDark", "--background"],
  ["colorForegroundDark", "--foreground"],
];

/**
 * Scopes per-user theming to the wrapped subtree.
 *
 * Renders a wrapper element with two stable hooks the SSR head-injection
 * (`injectUserTheme` in api-server) also targets:
 *
 *   - `data-user-theme-scope="user-<id>"` — the unique attribute selector
 *     used by the `<style>` block injected in `<head>` at first paint.
 *     Because the selector is computed from the user's id (always a
 *     server-generated UUID for handle lookups, or a username sanitized
 *     to `[a-zA-Z0-9_-]`), it can be safely interpolated into CSS.
 *   - `data-theme="<userTheme>"` — already triggers all per-theme rules
 *     in `index.css` (border/font/radius/shadow tokens are scoped to
 *     `[data-theme="..."]`, not just `:root`).
 *
 * No-flash first paint: when the server has run `injectUserTheme` for
 * `/users/:handle`, it emits `window.__USER_THEME_BOOTSTRAP__` with the
 * scope key and theme. We read that on first render (synchronously, not
 * from React Query) so the wrapper exists with the right attributes
 * from frame 1 — and the head-injected CSS applies before the user
 * fetch resolves.
 *
 * Once the React Query fetch returns the full user, we render with the
 * in-memory CSS so SPA navigation between profile pages also works
 * without depending on the SSR'd block.
 *
 * The wrapper renders inside the user-profile page only, so navbar and
 * footer (which render outside this subtree) keep the site owner's
 * theme. Falls through to no wrapper when nothing is available.
 */
export function UserThemeScope({ user, children }: UserThemeScopeProps) {
  // Read the SSR bootstrap once on mount. It's a static window value
  // injected before the React bundle ran; it never changes.
  const bootstrap = useMemo(readBootstrap, []);

  // Stable scope key derived from the user's id (or the bootstrap when
  // user data hasn't arrived yet). Server-side injection targets the
  // same selector. We allow only `[a-zA-Z0-9_-]` so the value is always
  // a safe CSS attribute selector token.
  const scopeKey = useMemo(() => {
    if (user?.id) {
      const cleaned = String(user.id).replace(/[^a-zA-Z0-9_-]/g, "");
      if (cleaned) return `user-${cleaned}`;
    }
    return bootstrap?.scopeKey ?? null;
  }, [user?.id, bootstrap]);

  const customization = useMemo(() => {
    if (!scopeKey) return null;

    // If we have full user data, build the in-memory CSS so SPA
    // navigation works regardless of what the server injected.
    if (user) {
      const theme = safeTheme(user.theme);
      const lightVars: string[] = [];
      const darkVars: string[] = [];

      for (const [key, cssVar] of COLOR_KEY_TO_VAR) {
        const safe = safeHsl(user[key]);
        if (safe !== null) lightVars.push(`${cssVar}: ${safe};`);
      }
      const safeBg = safeHsl(user.colorBackground);
      if (safeBg !== null) {
        lightVars.push(`--card: ${safeBg};`);
        lightVars.push(`--popover: ${safeBg};`);
        lightVars.push(`--input: ${safeBg};`);
      }
      const safeFg = safeHsl(user.colorForeground);
      if (safeFg !== null) {
        lightVars.push(`--card-foreground: ${safeFg};`);
        lightVars.push(`--popover-foreground: ${safeFg};`);
      }
      const safeSecondary = safeHsl(user.colorSecondary);
      if (safeSecondary !== null) {
        lightVars.push(`--ring: ${safeSecondary};`);
      }

      for (const [key, cssVar] of DARK_COLOR_KEY_TO_VAR) {
        const safe = safeHsl(user[key]);
        if (safe !== null) darkVars.push(`${cssVar}: ${safe};`);
      }
      const safeBgDark = safeHsl(user.colorBackgroundDark);
      if (safeBgDark !== null) {
        darkVars.push(`--card: ${safeBgDark};`);
        darkVars.push(`--popover: ${safeBgDark};`);
        darkVars.push(`--input: ${safeBgDark};`);
      }
      const safeFgDark = safeHsl(user.colorForegroundDark);
      if (safeFgDark !== null) {
        darkVars.push(`--card-foreground: ${safeFgDark};`);
        darkVars.push(`--popover-foreground: ${safeFgDark};`);
      }

      const hasAnything = theme !== null || lightVars.length > 0 || darkVars.length > 0;
      if (!hasAnything) return null;

      const selector = `[data-user-theme-scope="${scopeKey}"]`;
      let css = "";
      if (lightVars.length > 0) {
        css += `${selector} { ${lightVars.join(" ")} }`;
      }
      if (darkVars.length > 0) {
        css += ` .dark ${selector}, ${selector}.dark { ${darkVars.join(" ")} }`;
      }
      return { theme, css };
    }

    // No user yet — but the SSR bootstrap gave us a scope key and
    // theme. Render the wrapper so the head-injected CSS applies on
    // first paint. We don't emit our own CSS here; the SSR'd block in
    // `<head>` already covers this scope key.
    if (bootstrap) {
      return { theme: bootstrap.theme, css: "" };
    }

    return null;
  }, [user, scopeKey, bootstrap]);

  if (!customization || !scopeKey) {
    return <>{children}</>;
  }

  return (
    <>
      {customization.css ? (
        <style data-user-theme-scope-style>{customization.css}</style>
      ) : null}
      <div
        data-user-theme-scope={scopeKey}
        data-theme={customization.theme ?? undefined}
      >
        {children}
      </div>
    </>
  );
}
