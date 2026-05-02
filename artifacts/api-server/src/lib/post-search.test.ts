import { describe, it, expect } from "vitest";
import { parseSearchQuery, buildSearchSnippet } from "./post-search";

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
