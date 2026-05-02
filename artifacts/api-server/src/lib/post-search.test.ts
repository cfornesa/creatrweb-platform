import { describe, it, expect } from "vitest";
import {
  parseSearchQuery,
  buildSearchSnippet,
  validateSearchInput,
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

  it("builds a single prefix term for a single word above the FULLTEXT min", () => {
    const q = parseSearchQuery("Chris");
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("chris*");
    expect(q!.terms).toEqual(["chris"]);
    expect(q!.likeTerms).toEqual([]);
  });

  it("OR-joins multiple words with prefix wildcards (no leading +)", () => {
    // The whole point of the new parser: multi-word queries match
    // ANY of the words rather than ALL of them. The relevance score
    // still floats docs that contain more terms to the top.
    const q = parseSearchQuery("react hook");
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("react* hook*");
    expect(q!.booleanExpression).not.toContain("+");
    expect(q!.terms).toEqual(["react", "hook"]);
    expect(q!.likeTerms).toEqual([]);
  });

  it("lowercases tokens and dedupes regardless of input case", () => {
    const q = parseSearchQuery("React REACT react");
    expect(q!.terms).toEqual(["react"]);
    expect(q!.booleanExpression).toBe("react*");
  });

  it("strips boolean-mode operators users may paste in", () => {
    // `+react -hook *foo` should become `react* hook* foo*` (OR).
    const q = parseSearchQuery("+react -hook *foo");
    expect(q!.terms).toEqual(["react", "hook", "foo"]);
    expect(q!.booleanExpression).toBe("react* hook* foo*");
  });

  it("routes tokens shorter than the FULLTEXT minimum to LIKE fallback", () => {
    // `js` is 2 chars — too short for FULLTEXT to index, so the
    // route needs a LIKE branch. `react` still goes to FULLTEXT.
    const q = parseSearchQuery("js react");
    expect(q!.booleanExpression).toBe("react*");
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
    expect(q!.booleanExpression).toBe("react* hook*");
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

describe("parseSearchQuery — short-token dual-branch coverage", () => {
  it("emits BOTH a FULLTEXT branch and a LIKE branch for 3-char tokens", () => {
    // 3-char tokens are right at the boundary of MySQL's FULLTEXT
    // min-token-size. Some deployments raise it above 3, so we keep
    // the LIKE branch as additive insurance even when FULLTEXT also
    // accepts the token.
    const q = parseSearchQuery("vue");
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("vue*");
    expect(q!.likeTerms).toEqual(["vue"]);
    expect(q!.terms).toEqual(["vue"]);
  });

  it("mixed 2-, 3-, and 5-char tokens land in the right buckets", () => {
    // js (2): LIKE only. iOS (3, lowercased): FULLTEXT + LIKE.
    // react (5): FULLTEXT only.
    const q = parseSearchQuery("js iOS react");
    expect(q).not.toBeNull();
    expect(q!.booleanExpression).toBe("ios* react*");
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
