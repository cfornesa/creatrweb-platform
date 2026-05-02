import { describe, it, expect } from "vitest";
import {
  cadenceIntervalMs,
  computeGuidHash,
  computeNextFetchAt,
  isSourceDue,
  normalizeFeedItem,
  pickOriginalAuthor,
  type RawFeedItem,
} from "./feed-ingest";

describe("computeGuidHash", () => {
  it("uses the explicit guid when present and returns lowercase hex sha256", () => {
    const { hash, guid } = computeGuidHash({ guid: "https://example.com/post-1" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(guid).toBe("https://example.com/post-1");
  });

  it("prefers `guid` over `id` when both exist", () => {
    const a = computeGuidHash({ guid: "the-guid", id: "the-id" });
    const b = computeGuidHash({ guid: "the-guid" });
    expect(a.hash).toBe(b.hash);
  });

  it("falls back to sha256 of `link\\ntitle` when no guid/id", () => {
    const { hash, guid } = computeGuidHash({
      link: "https://example.com/x",
      title: "Hello",
    } as RawFeedItem);
    expect(guid).toBeNull();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeGuidHash({ link: "https://example.com/x", title: "Hello" }).hash).toBe(hash);
  });

  it("produces different hashes for different inputs", () => {
    expect(computeGuidHash({ guid: "a" }).hash).not.toBe(computeGuidHash({ guid: "b" }).hash);
  });
});

describe("pickOriginalAuthor", () => {
  it("prefers <dc:creator> when present", () => {
    expect(pickOriginalAuthor({ creator: "Jane Doe", author: "jane@example.com" })).toBe("Jane Doe");
  });

  it("falls back to the literal `dc:creator` key when camelCase is missing", () => {
    expect(pickOriginalAuthor({ "dc:creator": "Jane Doe" } as RawFeedItem)).toBe("Jane Doe");
  });

  it("extracts the parenthesized name from RSS `email (Name)` form", () => {
    expect(pickOriginalAuthor({ author: "jane@example.com (Jane Doe)" })).toBe("Jane Doe");
  });

  it("returns the trimmed raw author when there is no parenthesized name", () => {
    expect(pickOriginalAuthor({ author: "  Jane Doe  " })).toBe("Jane Doe");
  });

  it("returns null when no author fields are usable", () => {
    expect(pickOriginalAuthor({})).toBeNull();
    expect(pickOriginalAuthor({ author: "   " })).toBeNull();
  });

  it("caps absurdly long author values to 255 chars", () => {
    const long = "X".repeat(1000);
    const out = pickOriginalAuthor({ author: long });
    expect(out).not.toBeNull();
    expect(out!.length).toBe(255);
  });
});

describe("normalizeFeedItem", () => {
  const baseItem: RawFeedItem = {
    guid: "https://example.com/post-42",
    link: "https://example.com/post-42",
    title: "Hello, world",
    isoDate: "2026-01-01T12:00:00.000Z",
    contentEncoded: "<p>Hi <strong>there</strong>.</p>",
  };

  it("emits sanitized html with title heading and a u-url + u-syndication link for HTML source items", () => {
    const out = normalizeFeedItem(baseItem, "Some Blog");
    expect(out.title).toBe("Hello, world");
    expect(out.publishedAt).toBe("2026-01-01T12:00:00.000Z");
    expect(out.canonicalUrl).toBe("https://example.com/post-42");
    expect(out.guid).toBe("https://example.com/post-42");
    expect(out.contentFormat).toBe("html");
    expect(out.content).toContain("<h2>Hello, world</h2>");
    expect(out.content).toContain("<strong>there</strong>");
    expect(out.content).toContain("Some Blog");
    expect(out.content).toContain("u-url");
    expect(out.content).toContain("u-syndication");
    expect(out.content).toContain("https://example.com/post-42");
  });

  it("includes the original author in the byline when the feed provides one", () => {
    const out = normalizeFeedItem({ ...baseItem, creator: "Jane Doe" }, "Some Blog");
    expect(out.originalAuthor).toBe("Jane Doe");
    expect(out.content).toContain("Jane Doe");
    expect(out.content).toContain("via");
    expect(out.content).toContain("Some Blog");
  });

  it("omits the byline cleanly when the feed has no author", () => {
    const out = normalizeFeedItem(baseItem, "Some Blog");
    expect(out.originalAuthor).toBeNull();
    expect(out.content).not.toContain("by <strong>");
    expect(out.content).toContain("via <strong>Some Blog");
  });

  it("strips dangerous tags from feed-supplied html", () => {
    const out = normalizeFeedItem(
      {
        ...baseItem,
        contentEncoded: `<p>ok</p><script>alert('xss')</script><img src="javascript:alert(1)">`,
      },
      "Some Blog",
    );
    expect(out.contentFormat).toBe("html");
    expect(out.content).not.toContain("<script");
    expect(out.content).not.toContain("javascript:");
  });

  it("escapes html in the title so a malicious title cannot break out", () => {
    const out = normalizeFeedItem(
      { ...baseItem, title: `<script>alert(1)</script>` },
      "Some Blog",
    );
    expect(out.content).not.toContain("<script>alert(1)</script>");
    expect(out.content).toContain("&lt;script&gt;");
  });

  it("escapes html injected through the author field", () => {
    const out = normalizeFeedItem(
      { ...baseItem, creator: `<script>alert(1)</script>` },
      "Some Blog",
    );
    expect(out.content).not.toContain("<script>alert(1)</script>");
  });

  it("stores plain-text-only items as contentFormat='plain' with text attribution", () => {
    const out = normalizeFeedItem(
      {
        guid: "g1",
        link: "https://example.com/x",
        title: "T",
        contentSnippet: "Plain text & <stuff>",
      },
      "Src",
    );
    expect(out.contentFormat).toBe("plain");
    expect(out.content).toContain("Plain text & <stuff>");
    expect(out.content).toContain("via Src");
    expect(out.content).toContain("https://example.com/x");
    expect(out.content).not.toContain("<h2>");
    expect(out.content).not.toContain("<a ");
  });

  it("uses the literal `content:encoded` key when camelCase is missing", () => {
    const out = normalizeFeedItem(
      {
        guid: "g2",
        link: "https://example.com/y",
        title: "T2",
        ["content:encoded"]: "<p>via colon key</p>",
      } as RawFeedItem,
      "Src",
    );
    expect(out.contentFormat).toBe("html");
    expect(out.content).toContain("via colon key");
  });

  it("supplies a placeholder body when the source has nothing", () => {
    const out = normalizeFeedItem(
      { guid: "empty", link: "https://example.com/e", title: "Empty" },
      "Src",
    );
    expect(out.contentFormat).toBe("html");
    expect(out.content).toContain("No body in source feed");
  });

  it("synthesizes publishedAt when isoDate/pubDate are absent or invalid", () => {
    const out = normalizeFeedItem(
      { guid: "n", link: "https://example.com/n", title: "N", isoDate: "not-a-date" },
      "Src",
    );
    expect(Number.isNaN(new Date(out.publishedAt).getTime())).toBe(false);
  });

  it("treats an <img>-only body as HTML", () => {
    const out = normalizeFeedItem(
      {
        guid: "img-only",
        link: "https://example.com/i",
        title: "I",
        content: '<img src="https://example.com/p.png" alt="pic">',
      },
      "Src",
    );
    expect(out.contentFormat).toBe("html");
  });
});

describe("cadenceIntervalMs / computeNextFetchAt / isSourceDue", () => {
  it("maps cadence strings to the right millisecond intervals", () => {
    expect(cadenceIntervalMs("daily")).toBe(24 * 60 * 60 * 1000);
    expect(cadenceIntervalMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(cadenceIntervalMs("monthly")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(cadenceIntervalMs("hourly")).toBe(24 * 60 * 60 * 1000);
  });

  it("computes the next fetch time as `now + interval`", () => {
    const now = new Date("2026-05-02T12:00:00.000Z");
    expect(computeNextFetchAt(now, "daily")).toBe("2026-05-03T12:00:00.000Z");
    expect(computeNextFetchAt(now, "weekly")).toBe("2026-05-09T12:00:00.000Z");
  });

  it("considers a never-fetched source (next_fetch_at NULL) due", () => {
    expect(isSourceDue(null)).toBe(true);
  });

  it("considers a source whose next_fetch_at is in the future NOT due", () => {
    const now = new Date("2026-05-02T12:00:00.000Z");
    const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    expect(isSourceDue(future, now)).toBe(false);
  });

  it("considers a source whose next_fetch_at has passed due", () => {
    const now = new Date("2026-05-02T12:00:00.000Z");
    const past = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    expect(isSourceDue(past, now)).toBe(true);
  });

  it("treats an unparseable next_fetch_at as 'never fetched'", () => {
    expect(isSourceDue("not-a-date")).toBe(true);
  });
});
