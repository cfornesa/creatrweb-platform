/**
 * Reserved slug list shared by `pages.slug` and `categories.slug`
 * validation. These are top-level frontend routes that must never be
 * shadowed by user-generated content. Adding a new top-level route in
 * `App.tsx` requires adding its name here in the same change.
 *
 * Compared case-insensitively after lowercasing the candidate slug.
 * The list intentionally lives in `@workspace/db` (not the API server)
 * so any package wiring up slug validation can import it without
 * pulling in Express.
 */
export const RESERVED_SLUGS: readonly string[] = [
  "feeds",
  "search",
  "settings",
  "admin",
  "sign-in",
  "sign-up",
  "posts",
  "users",
  "categories",
  "p",
  "embed",
  "api",
];

const RESERVED_SLUG_SET = new Set(RESERVED_SLUGS.map((s) => s.toLowerCase()));

export function isReservedSlug(value: string): boolean {
  if (typeof value !== "string") return false;
  return RESERVED_SLUG_SET.has(value.trim().toLowerCase());
}
