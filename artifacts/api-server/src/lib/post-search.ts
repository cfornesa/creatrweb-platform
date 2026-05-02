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
  /**
   * Raw expression for `MATCH(...) AGAINST(? IN BOOLEAN MODE)`.
   * Empty string when every input token is shorter than the FULLTEXT
   * minimum token length — in that case the route relies entirely on
   * the LIKE fallback below.
   */
  booleanExpression: string;
  /** Lowercased, dedup'd word stems used for snippet highlighting. */
  terms: string[];
  /**
   * Tokens shorter than the FULLTEXT minimum token size. The FULLTEXT
   * index silently ignores them, so the route ORs in a
   * `LOWER(content_text) LIKE LOWER('%term%')` predicate to keep them
   * findable. Trade speed for correctness — short queries are uncommon.
   */
  likeTerms: string[];
};

// MySQL InnoDB's default `innodb_ft_min_token_size` is 3, and MyISAM's
// default `ft_min_word_len` is 4. We use 3 here, which is correct for
// our InnoDB tables; tokens of length 1–2 fall back to LIKE.
const FULLTEXT_MIN_LEN = 3;

export function parseSearchQuery(raw: string): SearchQuery | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip MySQL boolean-mode operators that visitors might paste in
  // (`+`, `-`, `*`, `>`, `<`, `(`, `)`, `~`, `@`, `"`). We rebuild the
  // expression ourselves so a typed `+` or `*` doesn't silently change
  // the semantics of the search.
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

  // OR-of-terms: each indexable token gets a trailing `*` for prefix
  // matching but no leading `+`, so a multi-word query matches any of
  // the words. Posts that match more terms still float to the top
  // because the relevance score sums per-term contributions.
  // e.g. `react hook` → `react* hook*`, `chris` → `chris*`.
  const fulltextParts: string[] = [];
  const likeTerms: string[] = [];
  for (const term of terms) {
    if (term.length >= FULLTEXT_MIN_LEN) {
      fulltextParts.push(`${term}*`);
    } else {
      likeTerms.push(term);
    }
  }
  const booleanExpression = fulltextParts.join(" ");

  // Nothing usable in either bucket — should be impossible because
  // `terms` is non-empty, but guard so the route never sees a search
  // with no predicates at all.
  if (booleanExpression.length === 0 && likeTerms.length === 0) return null;

  return { booleanExpression, terms, likeTerms };
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
