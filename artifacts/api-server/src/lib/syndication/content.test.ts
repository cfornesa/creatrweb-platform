import { describe, expect, it } from "vitest";
import { buildSourceFooter, buildSyndicatedContent, shouldAppendSourceFooter } from "./content";

describe("syndication content helpers", () => {
  it("builds escaped footer markup with the configured site title", () => {
    const footer = buildSourceFooter('My <Site> & Co.', "https://example.com/posts/42?x=1&y=2");

    expect(footer.html).toBe('<p><em>Original source at My &lt;Site&gt; &amp; Co.: <a href="https://example.com/posts/42?x=1&amp;y=2" class="u-url" rel="noopener noreferrer nofollow" target="_blank">https://example.com/posts/42?x=1&amp;y=2</a></em></p>');
    expect(footer.text).toBe("Original source at My <Site> & Co.: https://example.com/posts/42?x=1&y=2");
  });

  it("falls back to the canonical host when the site title is blank", () => {
    const footer = buildSourceFooter("   ", "https://creatr.example/posts/7");

    expect(footer.text).toBe("Original source at creatr.example: https://creatr.example/posts/7");
  });

  it("appends an html footer for rich posts", () => {
    const footer = buildSourceFooter("My Site", "https://example.com/posts/42");

    expect(buildSyndicatedContent({
      contentHtml: "<p>Hello</p>",
      contentFormat: "html",
      sourceFooterHtml: footer.html,
      sourceFooterText: footer.text,
    })).toBe(`<p>Hello</p>\n${footer.html}`);
  });

  it("appends a text footer for plain posts", () => {
    const footer = buildSourceFooter("My Site", "https://example.com/posts/42");

    expect(buildSyndicatedContent({
      contentHtml: "Hello world",
      contentFormat: "plain",
      sourceFooterHtml: footer.html,
      sourceFooterText: footer.text,
    })).toBe(`Hello world\n\n${footer.text}`);
  });

  it("only appends footers for native posts", () => {
    expect(shouldAppendSourceFooter({ sourceFeedId: null })).toBe(true);
    expect(shouldAppendSourceFooter({ sourceFeedId: 12 })).toBe(false);
  });
});
