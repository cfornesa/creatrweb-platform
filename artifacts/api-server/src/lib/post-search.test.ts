import { describe, it, expect } from "vitest";
import {
  parseSearchQuery,
  buildSearchSnippet,
  validateSearchInput,
  MAX_SEARCH_QUERY_LENGTH,
} from "./post-search";

describe("parseSearchQuery", () => {
  it("returns null for empty / whitespace-only input", () => {
    expect(parseSearchQuery("")).toBeNull();
    expect(parseSearchQuery("   ")).toBeNull();
    expect(parseSearchQuery("\t\n")).toBeNull();
  });

  it("returns null when input collapses to nothing after operator stripping", () => {
    // All characters are operators that we strip out before tokenizing.
    expect(parseSearchQuery("+++")).toBeNull();
    expect(parseSearchQuery('"*()@~')).toBeNull();
  });

  it("builds a single required prefix term for a single word above the FULLTEXT min", () => {
    const q = parseSearchQuery("Chris");
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("+chris*");
    expect(q!.terms).toEqual(["chris"]);
    expect(q!.likeTerms).toEqual([]);
  });

  it("AND-joins multiple words with required prefix wildcards (each `+`-prefixed)", () => {
    // Per task: unquoted words are each required, prefix-matched.
    // `react hook` ⇒ `+react* +hook*` so a post must contain BOTH
    // words (with prefix matching) to surface in the result set.
    const q = parseSearchQuery("react hook");
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("+react* +hook*");
    expect(q!.terms).toEqual(["react", "hook"]);
    expect(q!.likeTerms).toEqual([]);
  });

  it("lowercases tokens and dedupes regardless of input case", () => {
    const q = parseSearchQuery("React REACT react");
    expect(q!.terms).toEqual(["react"]);
    expect(q!.booleanExpression).toBe("+react*");
  });

  it("strips boolean-mode operators users may paste in", () => {
    // `+react -hook *foo` should become `+react* +hook* +foo*`.
    const q = parseSearchQuery("+react -hook *foo");
    expect(q!.terms).toEqual(["react", "hook", "foo"]);
    expect(q!.booleanExpression).toBe("+react* +hook* +foo*");
  });

  it("routes tokens shorter than the FULLTEXT minimum to LIKE fallback", () => {
    // `js` is 2 chars — too short for FULLTEXT to index, so the
    // route needs a LIKE branch. `react` still goes to FULLTEXT.
    const q = parseSearchQuery("js react");
    expect(q!.booleanExpression).toBe("+react*");
    expect(q!.likeTerms).toEqual(["js"]);
    expect(q!.terms).toEqual(["js", "react"]);
  });

  it("returns LIKE-only query when every token is too short for FULLTEXT", () => {
    const q = parseSearchQuery("js");
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("");
    expect(q!.likeTerms).toEqual(["js"]);
    expect(q!.terms).toEqual(["js"]);
  });

  it("collapses runs of internal whitespace to single tokens", () => {
    const q = parseSearchQuery("  react    hook  ");
    expect(q!.terms).toEqual(["react", "hook"]);
    expect(q!.booleanExpression).toBe("+react* +hook*");
  });

  it("leaves a normal-length query unmodified by the length cap", () => {
    // A realistic multi-word query well under the cap should round-trip
    // exactly as if the cap weren't there. The cap is a backstop; it
    // must not perturb everyday traffic.
    const normal = "react hooks performance optimization tips";
    expect(normal.length).toBeLessThan(MAX_SEARCH_QUERY_LENGTH);
    const q = parseSearchQuery(normal);
    expect(q).not.toBeNull();
    expect(q!.terms).toEqual([
      "react",
      "hooks",
      "performance",
      "optimization",
      "tips",
    ]);
    expect(q!.booleanExpression).toBe(
      "+react* +hooks* +performance* +optimization* +tips*",
    );
  });

  it("silently truncates inputs longer than MAX_SEARCH_QUERY_LENGTH", () => {
    // Simulate an attacker pasting a multi-megabyte string. The parser
    // must not pass the entire payload through to a `LIKE '%…%'`
    // predicate — it should clamp to the cap before tokenizing.
    const head = "react ";
    const giantTail = "junkjunkjunk".repeat(500_000); // ~6 MB
    const huge = head + giantTail;
    expect(huge.length).toBeGreaterThan(MAX_SEARCH_QUERY_LENGTH);

    const q = parseSearchQuery(huge);
    expect(q).not.toBeNull();
    // Only the first MAX_SEARCH_QUERY_LENGTH chars are considered, so
    // "react" survives and at most one truncated `junkjunk…` fragment
    // follows. The total emitted boolean expression length is bounded
    // by the cap (plus the `+` prefix and `*` suffix per term), not
    // by the input size.
    expect(q!.booleanExpression.length).toBeLessThan(
      MAX_SEARCH_QUERY_LENGTH * 2,
    );
    expect(q!.terms[0]).toBe("react");
    // Sanity: nowhere near 500_000 repetitions of the junk token end
    // up in the parsed terms list.
    expect(q!.terms.length).toBeLessThan(10);
  });

  it("treats an input exactly at the cap as a normal query", () => {
    // Boundary: inputs of length === MAX_SEARCH_QUERY_LENGTH must not
    // be truncated. Only `> cap` triggers the slice.
    const exact = "a".repeat(MAX_SEARCH_QUERY_LENGTH);
    const q = parseSearchQuery(exact);
    expect(q).not.toBeNull();
    expect(q!.terms).toEqual([exact]);
  });
});

describe("buildSearchSnippet", () => {
  it("returns empty string when contentText is null/empty", () => {
    expect(buildSearchSnippet(null, ["foo"])).toBe("");
    expect(buildSearchSnippet("", ["foo"])).toBe("");
    expect(buildSearchSnippet("   ", ["foo"])).toBe("");
  });

  it("returns the leading slice (no marks) when there are no terms", () => {
    expect(buildSearchSnippet("Hello world", [])).toBe("Hello world");
  });

  it("wraps the matched term in <mark> tags (case-insensitive)", () => {
    const out = buildSearchSnippet("Hello Chris from the team", ["chris"]);
    expect(out).toContain("<mark>Chris</mark>");
  });

  it("escapes HTML in the source before highlighting", () => {
    // The `<` in the source must be escaped, but the `<mark>` we
    // inject around the term must NOT be escaped — that's the
    // promise the helper makes to the route handler.
    const out = buildSearchSnippet("see <foo> chris here", ["chris"]);
    expect(out).toContain("&lt;foo&gt;");
    expect(out).toContain("<mark>chris</mark>");
  });
});

describe("parseSearchQuery — quoted phrase support", () => {
  it("treats a single quoted phrase as a required exact-phrase clause", () => {
    // `"hello world"` should *only* match posts containing those
    // words together in that order, so it lands as `+"hello world"`
    // in MySQL boolean mode. The `+` makes it required, the quotes
    // make it a phrase. No route changes needed — this is purely a
    // boolean-mode feature.
    const q = parseSearchQuery('"hello world"');
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe('+"hello world"');
    expect(q!.terms).toEqual(["hello", "world"]);
    expect(q!.likeTerms).toEqual([]);
  });

  it("lowercases phrase contents while preserving word order", () => {
    const q = parseSearchQuery('"Hello World"');
    expect(q!.booleanExpression).toBe('+"hello world"');
    expect(q!.terms).toEqual(["hello", "world"]);
  });

  it("normalizes whitespace inside the phrase", () => {
    const q = parseSearchQuery('"  hello   world  "');
    expect(q!.booleanExpression).toBe('+"hello world"');
    expect(q!.terms).toEqual(["hello", "world"]);
  });

  it("scrubs boolean-mode operators inside the phrase", () => {
    // `"+foo *bar"` should not smuggle a `*` or `+` into the phrase
    // text — those would terminate or otherwise corrupt the phrase
    // when re-injected into the boolean expression.
    const q = parseSearchQuery('"+foo *bar"');
    expect(q!.booleanExpression).toBe('+"foo bar"');
    expect(q!.terms).toEqual(["foo", "bar"]);
  });

  it("combines a required phrase with required unquoted words", () => {
    // The phrase is required AND each unquoted word is also required
    // (per the task). Boolean expression: `+"hello world" +react*`.
    const q = parseSearchQuery('"hello world" react');
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe('+"hello world" +react*');
    expect(q!.terms).toEqual(["hello", "world", "react"]);
    expect(q!.likeTerms).toEqual([]);
  });

  it("skips an unquoted word that already appears in a phrase", () => {
    // The phrase already pins both words; emitting a separate
    // `+react*` branch would be redundant noise.
    const q = parseSearchQuery('"react hook" react');
    expect(q!.booleanExpression).toBe('+"react hook"');
    expect(q!.terms).toEqual(["react", "hook"]);
  });

  it("supports multiple phrases — each becomes its own +clause", () => {
    const q = parseSearchQuery('"hello world" "foo bar"');
    expect(q!.booleanExpression).toBe('+"hello world" +"foo bar"');
    expect(q!.terms).toEqual(["hello", "world", "foo", "bar"]);
  });

  it("ignores empty phrases and falls back to unquoted parsing", () => {
    // `""` collapses away; `hello` is parsed as a normal unquoted
    // word and remains required (`+hello*`).
    const q = parseSearchQuery('"" hello');
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("+hello*");
    expect(q!.terms).toEqual(["hello"]);
  });

  it("returns null when only empty phrases are given", () => {
    expect(parseSearchQuery('""')).toBeNull();
    expect(parseSearchQuery('"" "" ""')).toBeNull();
  });

  it("treats an unbalanced trailing quote as the existing operator strip", () => {
    // No closing `"` ⇒ no phrase extraction; the lone `"` is scrubbed
    // by the second-pass operator strip and the word survives.
    const q = parseSearchQuery('"hello');
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("+hello*");
    expect(q!.terms).toEqual(["hello"]);
  });
});

describe("parseSearchQuery — short-token dual-branch coverage", () => {
  it("emits BOTH a FULLTEXT branch and a LIKE branch for 3-char tokens", () => {
    // 3-char tokens are right at the boundary of MySQL's FULLTEXT
    // min-token-size. Some deployments raise it above 3, so we keep
    // the LIKE branch as additive insurance even when FULLTEXT also
    // accepts the token.
    const q = parseSearchQuery("vue");
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("+vue*");
    expect(q!.likeTerms).toEqual(["vue"]);
    expect(q!.terms).toEqual(["vue"]);
  });

  it("mixed 2-, 3-, and 5-char tokens land in the right buckets", () => {
    // js (2): LIKE only. iOS (3, lowercased): FULLTEXT + LIKE.
    // react (5): FULLTEXT only.
    const q = parseSearchQuery("js iOS react");
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("+ios* +react*");
    expect(q!.likeTerms).toEqual(["js", "ios"]);
    expect(q!.terms).toEqual(["js", "ios", "react"]);
  });
});

describe("validateSearchInput — pagination & format gate", () => {
  it("returns defaults when no params are provided", () => {
    const r = validateSearchInput({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ page: 1, limit: 20, formats: null });
    }
  });

  it("treats whitespace-only / non-string params as 'not provided'", () => {
    const r = validateSearchInput({ page: "  ", limit: undefined, format: 42 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ page: 1, limit: 20, formats: null });
  });

  it("accepts well-formed page and limit", () => {
    const r = validateSearchInput({ page: "3", limit: "50", format: "html" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ page: 3, limit: 50, formats: ["html"] });
  });

  it("rejects malformed page (non-digit garbage) with 'page' field", () => {
    const r = validateSearchInput({ page: "abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("page");
  });

  it("rejects partially-numeric page like '3abc'", () => {
    // Bare `Number.parseInt` would silently return 3 and the bad
    // suffix would vanish — make sure the validator catches it.
    const r = validateSearchInput({ page: "3abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("page");
  });

  it("rejects page=0 and negative page", () => {
    const zero = validateSearchInput({ page: "0" });
    expect(zero.ok).toBe(false);
    const neg = validateSearchInput({ page: "-1" });
    // "-1" fails the digit-only regex, so it's also rejected.
    expect(neg.ok).toBe(false);
  });

  it("rejects malformed limit", () => {
    const r = validateSearchInput({ limit: "twenty" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("limit");
  });

  it("rejects limit above the cap (51)", () => {
    const r = validateSearchInput({ limit: "51" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("limit");
  });

  it("rejects limit=0", () => {
    const r = validateSearchInput({ limit: "0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("limit");
  });

  it("rejects unknown format token", () => {
    const r = validateSearchInput({ format: "markdown" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("format");
  });

  it("rejects format with mixed valid+invalid tokens", () => {
    const r = validateSearchInput({ format: "html,markdown" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("format");
  });

  it("collapses 'html,plain' to null (no filter)", () => {
    const r = validateSearchInput({ format: "html,plain" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.formats).toBeNull();
  });

  it("normalizes single-format casing and whitespace", () => {
    const r = validateSearchInput({ format: "  HTML  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.formats).toEqual(["html"]);
  });

  it("ignores trailing/empty comma tokens like 'plain,'", () => {
    const r = validateSearchInput({ format: "plain," });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.formats).toEqual(["plain"]);
  });

  it("dedupes repeated format tokens", () => {
    const r = validateSearchInput({ format: "html,html" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.formats).toEqual(["html"]);
  });
});
