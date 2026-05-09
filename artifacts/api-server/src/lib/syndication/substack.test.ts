import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  updateMock,
  eqMock,
  formatMysqlDateTimeMock,
} = vi.hoisted(() => ({
  updateMock: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(),
    })),
  })),
  eqMock: vi.fn(() => "eq-clause"),
  formatMysqlDateTimeMock: vi.fn(() => "2026-05-08 12:00:00.000"),
}));

vi.mock("@workspace/db", () => ({
  db: {
    update: updateMock,
  },
  eq: eqMock,
  formatMysqlDateTime: formatMysqlDateTimeMock,
  platformConnectionsTable: {
    id: "id-column",
  },
}));

vi.mock("../crypto", () => ({
  decryptSecret: vi.fn((value: string) => value),
}));

vi.mock("../logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { buildSubstackDraftBodyDocument, substackAdapter } from "./substack";
import { SyndicationAuthExpiredError, SyndicationConfigurationError } from "./types";

describe("substackAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    updateMock.mockClear();
    eqMock.mockClear();
    formatMysqlDateTimeMock.mockClear();
  });

  it("publishes with the stored connect.sid cookie after the 1.5s delay", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 321 }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 41 }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 42,
          canonical_url: "https://example.substack.com/p/hello",
        }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      });
    vi.stubGlobal("fetch", fetchMock);

    const publishPromise = substackAdapter.publish(
      {
        id: 7,
        platform: "substack",
        encryptedAccessToken: "cookie-value",
        metadata: { publicationId: "123", publicationHost: "writer.substack.com" },
      } as never,
      {
        title: "Hello",
        contentHtml: "<p>world</p>",
        canonicalUrl: "https://platform.example.com/posts/1",
      },
      {},
    );

    await vi.advanceTimersByTimeAsync(1499);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(publishPromise).resolves.toEqual({
      externalId: "42",
      externalUrl: "https://example.substack.com/p/hello",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://substack.com/sign-in?redirect=%2F&for_pub=writer",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "connect.sid=cookie-value",
          Referer: "https://substack.com/",
          Origin: "https://substack.com",
        }),
      }),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://substack.com/api/v1/user/profile/self",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "connect.sid=cookie-value",
          Referer: "https://substack.com/",
          Origin: "https://substack.com",
        }),
      }),
    );

    const [, draftRequestInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    const parsedDraftBody = JSON.parse(String(draftRequestInit.body));
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://writer.substack.com/api/v1/drafts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Cookie: "connect.sid=cookie-value",
          Referer: "https://writer.substack.com/publish/post",
          Origin: "https://writer.substack.com",
        }),
      }),
    );
    expect(parsedDraftBody).toEqual(expect.objectContaining({
      draft_title: "Hello",
      draft_bylines: [{ id: 321, is_guest: false }],
      draft_podcast_url: null,
      draft_podcast_duration: null,
      draft_section_id: null,
      section_chosen: false,
      audience: "everyone",
    }));
    expect(parsedDraftBody).not.toHaveProperty("body");
    expect(parsedDraftBody).toHaveProperty("draft_body");

    const parsedDraftDocument = JSON.parse(parsedDraftBody.draft_body as string);
    expect(parsedDraftDocument).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "world" }],
        },
      ],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://writer.substack.com/api/v1/drafts/41/prepublish",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "connect.sid=cookie-value",
          Referer: "https://writer.substack.com/publish/post",
          Origin: "https://writer.substack.com",
        }),
      }),
    );

    const [, publishRequestInit] = fetchMock.mock.calls[4] as [string, RequestInit];
    const parsedPublishBody = JSON.parse(String(publishRequestInit.body));
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "https://writer.substack.com/api/v1/drafts/41/publish",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Cookie: "connect.sid=cookie-value",
          Referer: "https://writer.substack.com/publish/post",
          Origin: "https://writer.substack.com",
        }),
      }),
    );
    expect(parsedPublishBody).toEqual(expect.objectContaining({
      send: false,
      share_automatically: false,
    }));
  });

  it("marks the connection expired and throws a dedicated auth error on 401", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      });
    vi.stubGlobal("fetch", fetchMock);

    const publishPromise = substackAdapter.publish(
      {
        id: 9,
        platform: "substack",
        encryptedAccessToken: "cookie-value",
        metadata: { publicationId: "999", publicationHost: "writer.substack.com" },
      } as never,
      {
        title: "Expired",
        contentHtml: "<p>session</p>",
        canonicalUrl: "https://platform.example.com/posts/2",
      },
      {},
    );
    const rejection = expect(publishPromise).rejects.toBeInstanceOf(SyndicationAuthExpiredError);

    await vi.advanceTimersByTimeAsync(1500);
    await rejection;

    expect(updateMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith("id-column", 9);
  });

  it("fails gracefully when the connection is not configured", async () => {
    await expect(
      substackAdapter.publish(
        {
          id: 10,
          platform: "substack",
          encryptedAccessToken: null,
          metadata: null,
        } as never,
        {
          title: "No config",
          contentHtml: "<p>nope</p>",
          canonicalUrl: "https://platform.example.com/posts/3",
        },
        {},
      ),
    ).rejects.toBeInstanceOf(SyndicationConfigurationError);
  });

  it("sends the Substack newsletter when explicitly requested", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 321 }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 41 }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 42, canonical_url: "https://example.substack.com/p/hello" }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      });
    vi.stubGlobal("fetch", fetchMock);

    const publishPromise = substackAdapter.publish(
      {
        id: 11,
        platform: "substack",
        encryptedAccessToken: "cookie-value",
        metadata: { publicationId: "123", publicationHost: "writer.substack.com" },
      } as never,
      {
        title: "Hello",
        contentHtml: "<p>world</p>",
        canonicalUrl: "https://platform.example.com/posts/1",
      },
      { substackSendNewsletter: true },
    );

    await vi.advanceTimersByTimeAsync(1500);
    await publishPromise;

    const [, publishRequestInit] = fetchMock.mock.calls[4] as [string, RequestInit];
    const parsedPublishBody = JSON.parse(String(publishRequestInit.body));
    expect(parsedPublishBody).toEqual(expect.objectContaining({
      send: true,
      share_automatically: false,
    }));
  });

  it("reuses publication sign-in cookies when Substack returns them", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: () => null,
          getSetCookie: () => [
            "substack.sid=publication-cookie; Path=/; HttpOnly",
            "visitor=abc123; Path=/",
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 321 }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 41 }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 42, canonical_url: "https://example.substack.com/p/hello" }),
        headers: {
          get: () => null,
          getSetCookie: () => [],
        },
      });
    vi.stubGlobal("fetch", fetchMock);

    const publishPromise = substackAdapter.publish(
      {
        id: 12,
        platform: "substack",
        encryptedAccessToken: "foo=bar; connect.sid=cookie-value",
        metadata: { publicationId: "123", publicationHost: "writer.substack.com" },
      } as never,
      {
        title: "Hello",
        contentHtml: "<p>world</p>",
        canonicalUrl: "https://platform.example.com/posts/1",
      },
      {},
    );

    await vi.advanceTimersByTimeAsync(1500);
    await publishPromise;

    const [, profileInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(profileInit.headers).toEqual(expect.objectContaining({
      Cookie: "foo=bar; connect.sid=cookie-value; substack.sid=publication-cookie; visitor=abc123",
    }));

    const [, draftInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(draftInit.headers).toEqual(expect.objectContaining({
      Cookie: "foo=bar; connect.sid=cookie-value; substack.sid=publication-cookie; visitor=abc123",
    }));
  });

  it("maps rich html into a structured Substack draft document", () => {
    const doc = buildSubstackDraftBodyDocument(
      "<h2>Heading</h2><p><strong>Bold</strong> <em>Italic</em> <a href=\"https://example.com\">Link</a><br>Line two</p><ul><li>One</li><li>Two</li></ul><blockquote><p>Quoted</p></blockquote><pre><code>const x = 1;</code></pre><hr>",
    );

    expect(doc.content[0]).toEqual({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Heading" }],
    });

    const paragraph = doc.content[1];
    expect(paragraph).toMatchObject({ type: "paragraph" });
    expect(JSON.stringify(paragraph)).toContain("\"bold\"");
    expect(JSON.stringify(paragraph)).toContain("\"italic\"");
    expect(JSON.stringify(paragraph)).toContain("\"hardBreak\"");
    expect(JSON.stringify(paragraph)).toContain("https://example.com");
    expect(JSON.stringify(paragraph)).toContain("Line two");

    expect(doc.content[2]).toEqual({
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }] },
      ],
    });
    expect(doc.content[3]).toEqual({
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted" }] }],
    });
    expect(doc.content[4]).toEqual({
      type: "codeBlock",
      content: [{ type: "text", text: "const x = 1;" }],
    });
    expect(doc.content[5]).toEqual({ type: "horizontalRule" });
  });

  it("fails clearly on unsupported embedded content", () => {
    expect(() => buildSubstackDraftBodyDocument("<p>ok</p><iframe src=\"https://example.com/embed\"></iframe>")).toThrow(
      "Substack content mapping error",
    );
  });
});
