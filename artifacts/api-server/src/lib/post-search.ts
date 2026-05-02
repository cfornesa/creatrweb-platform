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
   * Raw expression for `MATCH(...) AGAINST(? IN BOOLEAN MODE)`. Each
   * typed word becomes a required prefix-matched clause (`+word*`),
   * and each `"..."` phrase becomes a required exact-phrase clause
   * (`+"hello world"`). Both unquoted words and phrases must appear
   * in the post for a row to match — phrase matching enforces the
   * word order, prefix matching keeps singular/plural and stem
   * variations findable. Empty string when every input token is
   * shorter than the FULLTEXT minimum token length — in that case
   * the route relies entirely on the LIKE fallback below.
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
// default `ft_min_word_len` is 4. We use the InnoDB default (3) here
// because our `posts.content_text` FULLTEXT index lives on an InnoDB
// table — that's the FULLTEXT lower bound for our setup.
//
// `LIKE_FALLBACK_MAX_LEN` is intentionally one larger: a token of
// length 3 still emits a FULLTEXT branch *and* a LIKE branch. The two
// branches are OR-composed, so the LIKE branch is just additive
// insurance — it costs us a parameterized substring scan on those
// short tokens, but guarantees that 3-char queries (e.g. "Vue", "iOS")
// continue to match even if a future deploy ends up on a server where
// `innodb_ft_min_token_size` (or `ft_min_word_len`) is bumped to 4.
const FULLTEXT_MIN_LEN = 3;
const LIKE_FALLBACK_MAX_LEN = 3;

// Hard upper bound on the raw `q` string accepted by `parseSearchQuery`.
// The endpoint is intentionally permissive — garbage filter values
// collapse to "no filter" rather than 400 — so there's nothing else
// stopping a buggy or malicious client from pasting a multi-megabyte
// string into `q`. Without a cap that string would flow into a
// `LIKE '%…%'` predicate (and into the JSON response echo), forcing a
// slow scan for no good reason. 200 characters is well above any
// realistic human-typed query but small enough that the predicate
// stays cheap. Inputs longer than this are silently truncated at the
// top of `parseSearchQuery`; the route also clamps `rawQ` before
// echoing it back so the response payload stays bounded too.
export const MAX_SEARCH_QUERY_LENGTH = 200;

/**
 * Inputs the search route validates up front. The values that come
 * back are safe to use directly in SQL — `page`/`limit` are bounded
 * positive integers, and `formats` is either `null` (no filter) or a
 * non-empty list whose elements are exactly `"html"` / `"plain"`.
 */
export type ValidatedSearchInput = {
  page: number;
  limit: number;
  /** `null` means "no filter"; otherwise the route narrows by these. */
  formats: Array<"html" | "plain"> | null;
};

export type SearchInputValidationError = {
  field: "page" | "limit" | "format";
  message: string;
};

const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LIMIT = 50;

/**
 * Validate the typed query parameters that the route binds into SQL
 * (page, limit, format). Permissive on filters that just narrow the
 * result set — bad `from`/`to`/`sources`/`author` collapse to "no
 * filter" because there's no useful 400 to return for them — but
 * strict on numeric pagination and the enum format value, where a
 * bogus input is almost certainly a bug we want the client to fix.
 *
 * Returns a discriminated union so the caller can switch on
 * `result.ok` and either continue with `result.value` or short-circuit
 * with a 400 carrying `result.error.field`/`result.error.message`.
 */
export function validateSearchInput(query: {
  page?: unknown;
  limit?: unknown;
  format?: unknown;
}):
  | { ok: true; value: ValidatedSearchInput }
  | { ok: false; error: SearchInputValidationError } {
  const rawPage = typeof query.page === "string" ? query.page.trim() : "";
  const rawLimit = typeof query.limit === "string" ? query.limit.trim() : "";
  const rawFormat = typeof query.format === "string" ? query.format.trim() : "";

  let page = 1;
  if (rawPage.length > 0) {
    // Strict: only digit-strings count. `Number.parseInt("3abc")` would
    // happily return 3, which is not what the caller asked for.
    if (!/^\d+$/.test(rawPage)) {
      return {
        ok: false,
        error: { field: "page", message: "page must be a positive integer" },
      };
    }
    const n = Number.parseInt(rawPage, 10);
    if (!Number.isFinite(n) || n < 1) {
      return {
        ok: false,
        error: { field: "page", message: "page must be a positive integer" },
      };
    }
    page = n;
  }

  let limit = SEARCH_DEFAULT_LIMIT;
  if (rawLimit.length > 0) {
    if (!/^\d+$/.test(rawLimit)) {
      return {
        ok: false,
        error: {
          field: "limit",
          message: `limit must be an integer between 1 and ${SEARCH_MAX_LIMIT}`,
        },
      };
    }
    const n = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(n) || n < 1 || n > SEARCH_MAX_LIMIT) {
      return {
        ok: false,
        error: {
          field: "limit",
          message: `limit must be an integer between 1 and ${SEARCH_MAX_LIMIT}`,
        },
      };
    }
    limit = n;
  }

  let formats: Array<"html" | "plain"> | null = null;
  if (rawFormat.length > 0) {
    const tokens = rawFormat.split(",").map((t) => t.trim().toLowerCase());
    const valid: Array<"html" | "plain"> = [];
    for (const token of tokens) {
      if (token.length === 0) continue;
      if (token !== "html" && token !== "plain") {
        return {
          ok: false,
          error: {
            field: "format",
            message: "format must be 'html', 'plain', or 'html,plain'",
          },
        };
      }
      if (!valid.includes(token)) valid.push(token);
    }
    // `format=html,plain` is semantically identical to no filter;
    // collapse it so the route doesn't waste a predicate on it.
    formats = valid.length === 0 || valid.length === 2 ? null : valid;
  }

  return { ok: true, value: { page, limit, formats } };
}

export function parseSearchQuery(raw: string): SearchQuery | null {
  // Clamp before any further work so a multi-megabyte `q` can't drive
  // the regex or the downstream `LIKE '%…%'` predicate. See the comment
  // on `MAX_SEARCH_QUERY_LENGTH` above.
  const bounded =
    raw.length > MAX_SEARCH_QUERY_LENGTH
      ? raw.slice(0, MAX_SEARCH_QUERY_LENGTH)
      : raw;
  if (!bounded.trim()) return null;

  // Two-pass tokenization:
  //   1. Pull out balanced `"..."` segments as phrases. These become
  //      required exact-phrase clauses in the boolean expression
  //      (`+"hello world"`), so the user's "these words, in this
  //      order" intent is preserved.
  //   2. Fall through to the existing operator-strip + word split on
  //      whatever's left (unquoted words, plus any unbalanced `"`).
  // We extract phrases first so a stray operator inside a phrase
  // (e.g. `"foo+bar"`) is scrubbed inside the phrase rather than
  // shredding the surrounding text.
  const phraseTexts: string[] = [];
  const remainder = bounded.replace(/"([^"]*)"/g, (_match, inner: string) => {
    // Inside a MySQL boolean-mode phrase, `"` is the only true
    // terminator — but we scrub the same operator set used outside
    // for symmetry, and so an inner `*` doesn't get re-interpreted as
    // a prefix wildcard against the phrase.
    const cleanedPhrase = inner
      .replace(/[+\-><()~@*]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (cleanedPhrase.length > 0) {
      phraseTexts.push(cleanedPhrase);
    }
    return " ";
  });

  // Strip the remaining boolean-mode operators (`+`, `-`, `*`, `>`,
  // `<`, `(`, `)`, `~`, `@`, plus any stray unbalanced `"`) so a typed
  // operator can't silently change the semantics of the search.
  const cleaned = remainder
    .replace(/[+\-><()~@"*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const seen = new Set<string>();
  const terms: string[] = [];
  // Phrase words seed the highlight list first so a phrase like
  // `"hello world"` highlights `hello` then `world` (input order).
  // Words that appear both in a phrase and unquoted are deduped to
  // the phrase entry — the phrase clause already requires them.
  for (const phrase of phraseTexts) {
    for (const word of phrase.split(" ")) {
      if (!word) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      terms.push(word);
    }
  }
  // Unquoted words: collected separately so we know which terms
  // contribute their own boolean / LIKE branches (phrase-only words
  // ride on the phrase clause and don't need a redundant `word*`).
  const unquotedTerms: string[] = [];
  for (const word of cleaned.split(" ")) {
    const normalized = word.toLowerCase();
    if (normalized.length === 0) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    terms.push(normalized);
    unquotedTerms.push(normalized);
  }
  if (terms.length === 0) return null;

  // Build a single MySQL boolean-mode expression covering both
  // phrases and unquoted words. Each piece is `+`-prefixed so it's
  // required:
  //   * Quoted phrase ⇒ `+"hello world"` (exact, in order).
  //   * Unquoted word at/above FULLTEXT_MIN_LEN ⇒ `+word*` (required,
  //     prefix-matched so plural/stem variants still hit).
  // Sub-min-length tokens fall through to the LIKE fallback list.
  // The route feeds `booleanExpression` into the existing
  // `MATCH(...) AGAINST(? IN BOOLEAN MODE)` call — no route changes
  // needed; phrase support is purely a boolean-mode feature.
  const fulltextParts: string[] = [];
  const likeTerms: string[] = [];
  for (const phrase of phraseTexts) {
    fulltextParts.push(`+"${phrase}"`);
  }
  for (const term of unquotedTerms) {
    if (term.length >= FULLTEXT_MIN_LEN) {
      fulltextParts.push(`+${term}*`);
    }
    // Tokens at or below the fallback ceiling also get a LIKE branch.
    // For tokens of length 1–2 this is the *only* way they match. For
    // tokens of length exactly 3 it's belt-and-suspenders coverage in
    // case the deployed MySQL has a stricter min-token threshold than
    // the InnoDB default — see the constant declarations above.
    if (term.length <= LIKE_FALLBACK_MAX_LEN) {
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
