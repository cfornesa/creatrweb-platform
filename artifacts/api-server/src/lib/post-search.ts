/**
 * Helpers for `/api/posts/search`.
 *
 * - `parseSearchQuery` turns the raw `q` string into a MySQL boolean-mode
 *   expression and a list of normalized terms used for highlighting.
 * - `buildSearchSnippet` produces a short excerpt centered on the first
 *   matched term, with `<mark>` tags wrapping each occurrence. Because
 *   the server is the only place that does highlighting, the resulting
 *   string is HTML-safe by construction (we escape, then we wrap).
 */

const SNIPPET_RADIUS = 80;
const SNIPPET_MAX_LENGTH = 220;

export type SearchQuery = {
  /** Raw expression to feed `MATCH(...) AGAINST(? IN BOOLEAN MODE)`. */
  booleanExpression: string;
  /** Lowercased, dedup'd word stems used for snippet highlighting. */
  terms: string[];
};

export function parseSearchQuery(raw: string): SearchQuery | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip MySQL boolean-mode operators that visitors might paste in
  // (`+`, `-`, `*`, `>`, `<`, `(`, `)`, `~`, `@`, `"`). We rebuild the
  // expression ourselves with `+` prefixes for AND-of-terms semantics
  // and a trailing `*` for prefix matching, which is the closest to
  // "what people expect from a search box" within MySQL FULLTEXT.
  const cleaned = trimmed
    .replace(/[+\-><()~@"*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  const seen = new Set<string>();
  const terms: string[] = [];
  for (const word of cleaned.split(" ")) {
    const normalized = word.toLowerCase();
    if (normalized.length === 0) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(normalized);
  }
  if (terms.length === 0) return null;

  // Each term gets a `+` so it's required, and a trailing `*` so it
  // matches as a prefix. e.g. `react hook` → `+react* +hook*`.
  // Single-character terms are below MySQL's default ft_min_word_len
  // (4) so they would silently match nothing; we still include them in
  // the boolean expression but the relevance score will be zero, which
  // is fine — the server falls back to date order on a zero score.
  const booleanExpression = terms.map((term) => `+${term}*`).join(" ");

  return { booleanExpression, terms };
}

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render a snippet centered on the first matched term. Returns an
 * HTML-safe fragment with `<mark>…</mark>` around each match.
 *
 * When there are no terms (filter-only search) we return the leading
 * slice of `content_text` with no marks. When the post is empty we
 * return an empty string — the UI handles that as "no preview".
 */
export function buildSearchSnippet(
  contentText: string | null | undefined,
  terms: string[],
): string {
  const source = (contentText ?? "").trim();
  if (!source) return "";

  if (terms.length === 0) {
    const slice = source.slice(0, SNIPPET_MAX_LENGTH);
    return escapeHtml(slice) + (source.length > slice.length ? "…" : "");
  }

  const lower = source.toLowerCase();
  let firstIdx = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx;
    }
  }

  let start = 0;
  let end = Math.min(source.length, SNIPPET_MAX_LENGTH);
  let prefix = "";
  let suffix = source.length > end ? "…" : "";

  if (firstIdx !== -1) {
    start = Math.max(0, firstIdx - SNIPPET_RADIUS);
    end = Math.min(source.length, start + SNIPPET_MAX_LENGTH);
    if (end - start < SNIPPET_MAX_LENGTH) {
      start = Math.max(0, end - SNIPPET_MAX_LENGTH);
    }
    if (start > 0) prefix = "…";
    suffix = end < source.length ? "…" : "";
  }

  const window = source.slice(start, end);
  const escaped = escapeHtml(window);

  // Highlight the (escaped) window. Escape each term separately so the
  // pattern doesn't accidentally insert metacharacters; case-insensitive
  // because MySQL FULLTEXT ranks are case-insensitive too.
  const pattern = new RegExp(
    `(${terms.map((term) => escapeRegex(escapeHtml(term))).join("|")})`,
    "gi",
  );
  const highlighted = escaped.replace(pattern, "<mark>$1</mark>");

  return `${prefix}${highlighted}${suffix}`;
}
