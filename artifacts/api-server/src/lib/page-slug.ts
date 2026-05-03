import { db, pagesTable, eq, isReservedSlug } from "@workspace/db";

const SLUG_MAX_LEN = 96;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizePageSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LEN);
}

export type SlugRejection =
  | { kind: "empty" }
  | { kind: "too-long" }
  | { kind: "invalid-chars" }
  | { kind: "reserved"; slug: string }
  | { kind: "taken"; slug: string };

export async function validatePageSlug(
  rawSlug: string,
  opts: { excludePageId?: number } = {},
): Promise<{ slug: string } | { error: SlugRejection }> {
  const slug = (rawSlug ?? "").trim().toLowerCase();
  if (slug.length === 0) return { error: { kind: "empty" } };
  if (slug.length > SLUG_MAX_LEN) return { error: { kind: "too-long" } };
  if (!SLUG_PATTERN.test(slug)) return { error: { kind: "invalid-chars" } };
  if (isReservedSlug(slug)) return { error: { kind: "reserved", slug } };

  const existing = await db
    .select({ id: pagesTable.id })
    .from(pagesTable)
    .where(eq(pagesTable.slug, slug))
    .limit(1);
  const row = existing[0];
  if (row && row.id !== opts.excludePageId) {
    return { error: { kind: "taken", slug } };
  }
  return { slug };
}

export async function suggestAvailableSlug(baseSlug: string): Promise<string | null> {
  const base = baseSlug.replace(/-\d+$/, "");
  for (let i = 2; i <= 50; i += 1) {
    const candidate = `${base}-${i}`.slice(0, SLUG_MAX_LEN);
    if (isReservedSlug(candidate)) continue;
    const existing = await db
      .select({ id: pagesTable.id })
      .from(pagesTable)
      .where(eq(pagesTable.slug, candidate))
      .limit(1);
    if (!existing[0]) return candidate;
  }
  return null;
}

export function rejectionMessage(rej: SlugRejection): string {
  switch (rej.kind) {
    case "empty":
      return "slug is required";
    case "too-long":
      return `slug must be ${SLUG_MAX_LEN} characters or fewer`;
    case "invalid-chars":
      return "slug must be lowercase letters, digits, and hyphens (cannot start or end with a hyphen)";
    case "reserved":
      return `\`${rej.slug}\` is a reserved route on this site`;
    case "taken":
      return `\`${rej.slug}\` is already taken by another page`;
  }
}
