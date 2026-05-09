import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../crypto", () => ({
  decryptSecret: vi.fn((value: string) => value),
}));

vi.mock("../oauth-app-credentials", () => ({
  getOAuthAppCredentials: vi.fn(),
}));

import { bloggerAdapter } from "./blogger";
import { buildSourceFooter } from "./content";
import { mediumAdapter } from "./medium";
import { wordpressComAdapter } from "./wordpress-com";
import { wordpressSelfAdapter } from "./wordpress-self";

describe("syndication adapters append source footers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("appends the rich html footer for WordPress.com posts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ID: 9, URL: "https://wp.com/p/9" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const canonicalUrl = "https://creatr.example/posts/1";
    const footer = buildSourceFooter("CreatrWeb", canonicalUrl);

    await wordpressComAdapter.publish(
      {
        id: 1,
        platform: "wordpress_com",
        encryptedAccessToken: "token",
        metadata: { blogId: "123" },
      } as never,
      {
        title: "Hello",
        contentHtml: "<p>Body</p>",
        contentFormat: "html",
        canonicalUrl,
        sourceFooterHtml: footer.html,
        sourceFooterText: footer.text,
      },
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.content).toBe(`<p>Body</p>\n${footer.html}`);
  });

  it("appends the plain-text footer for self-hosted WordPress posts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 11, link: "https://blog.example/p/11" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const canonicalUrl = "https://creatr.example/posts/2";
    const footer = buildSourceFooter("CreatrWeb", canonicalUrl);

    await wordpressSelfAdapter.publish(
      {
        id: 2,
        platform: "wordpress_self",
        encryptedAccessToken: "base64-user-pass",
        metadata: { siteUrl: "https://blog.example" },
      } as never,
      {
        title: "",
        contentHtml: "Plain body",
        contentFormat: "plain",
        canonicalUrl,
        sourceFooterHtml: footer.html,
        sourceFooterText: footer.text,
      },
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.title).toBe("");
    expect(body.content).toBe(`Plain body\n\n${footer.text}`);
  });

  it("appends the rich html footer for Blogger posts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "33", url: "https://blogger.example/posts/33" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const canonicalUrl = "https://creatr.example/posts/3";
    const footer = buildSourceFooter("CreatrWeb", canonicalUrl);

    await bloggerAdapter.publish(
      {
        id: 3,
        platform: "blogger",
        encryptedAccessToken: "token",
        metadata: { blogId: "blog-123" },
      } as never,
      {
        title: "Blogger title",
        contentHtml: "<p>Hello Blogger</p>",
        contentFormat: "html",
        canonicalUrl,
        sourceFooterHtml: footer.html,
        sourceFooterText: footer.text,
      },
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.content).toBe(`<p>Hello Blogger</p>\n${footer.html}`);
  });

  it("keeps Medium canonical metadata while turning the footer into markdown-safe text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "m-1", url: "https://medium.com/@me/post" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const canonicalUrl = "https://creatr.example/posts/4";
    const footer = buildSourceFooter("CreatrWeb", canonicalUrl);

    await mediumAdapter.publish(
      {
        id: 4,
        platform: "medium",
        encryptedAccessToken: "token",
        metadata: { authorId: "author-123" },
      } as never,
      {
        title: "Medium title",
        contentHtml: "<p>Hello <strong>Medium</strong></p>",
        contentFormat: "html",
        canonicalUrl,
        sourceFooterHtml: footer.html,
        sourceFooterText: footer.text,
      },
    );

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.canonicalUrl).toBe(canonicalUrl);
    expect(body.content).toContain("Original source at CreatrWeb:");
    expect(body.content).toContain(canonicalUrl);
  });
});
