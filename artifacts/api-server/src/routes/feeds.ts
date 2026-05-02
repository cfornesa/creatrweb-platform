import { Router, type IRouter, type Request, type Response } from "express";
import sanitizeHtml from "sanitize-html";
import { db, postsTable, desc } from "@workspace/db";

type FeedPost = {
  id: number;
  authorName: string;
  content: string;
  contentFormat: "plain" | "html";
  createdAt: string;
};

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto?.split(",")[0]?.trim() || req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}`;
}

function getSiteTitle(): string {
  return process.env.SITE_TITLE?.trim() || "Microblog";
}

function getSiteDescription(): string {
  return (
    process.env.SITE_DESCRIPTION?.trim() ||
    "A personal microblog with rich posts, comments, and portable feed exports."
  );
}

function stripHtmlToText(value: string): string {
  const withoutTags = sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  });

  return withoutTags.replace(/\s+/g, " ").trim();
}

function toVisibleText(post: FeedPost): string {
  if (post.contentFormat === "html") {
    return stripHtmlToText(post.content);
  }

  return post.content.replace(/\s+/g, " ").trim();
}

function summarize(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 50) {
    return normalized;
  }

  return `${normalized.slice(0, 50)}...`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value: string): string {
  return value.replace(/\]\]>/g, "]]]]><![CDATA[>");
}

function getCanonicalPostUrl(origin: string, postId: number): string {
  return `${origin}/posts/${postId}`;
}

function getAuthorName(posts: FeedPost[]): string {
  return process.env.SITE_AUTHOR_NAME?.trim() || posts[0]?.authorName || "Microblog Author";
}

async function loadPosts(): Promise<FeedPost[]> {
  const posts = await db
    .select({
      id: postsTable.id,
      authorName: postsTable.authorName,
      content: postsTable.content,
      contentFormat: postsTable.contentFormat,
      createdAt: postsTable.createdAt,
    })
    .from(postsTable)
    .orderBy(desc(postsTable.createdAt));

  return posts as FeedPost[];
}

router.get("/feed.xml", async (req: Request, res: Response) => {
  try {
    const origin = getOrigin(req);
    const posts = await loadPosts();
    const siteTitle = getSiteTitle();
    const siteDescription = getSiteDescription();
    const authorName = getAuthorName(posts);
    const updatedAt = posts[0]?.createdAt ?? new Date().toISOString();

    const entries = posts
      .map((post) => {
        const canonicalUrl = getCanonicalPostUrl(origin, post.id);
        const visibleText = toVisibleText(post);
        const summary = summarize(visibleText);
        const contentHtml =
          post.contentFormat === "html" ? post.content : `<p>${xmlEscape(post.content)}</p>`;

        return `
  <entry>
    <id>${xmlEscape(canonicalUrl)}</id>
    <title>${xmlEscape(summary || `Post ${post.id}`)}</title>
    <link href="${xmlEscape(canonicalUrl)}" />
    <updated>${xmlEscape(post.createdAt)}</updated>
    <published>${xmlEscape(post.createdAt)}</published>
    <summary>${xmlEscape(summary)}</summary>
    <author><name>${xmlEscape(post.authorName || authorName)}</name></author>
    <content type="html"><![CDATA[${cdata(contentHtml)}]]></content>
  </entry>`;
      })
      .join("\n");

    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${xmlEscape(origin)}</id>
  <title>${xmlEscape(siteTitle)}</title>
  <subtitle>${xmlEscape(siteDescription)}</subtitle>
  <updated>${xmlEscape(updatedAt)}</updated>
  <link rel="self" href="${xmlEscape(`${origin}/feed.xml`)}" />
  <link rel="alternate" href="${xmlEscape(origin)}" />
  <author><name>${xmlEscape(authorName)}</name></author>
${entries}
</feed>`;

    res.type("application/atom+xml; charset=utf-8");
    res.send(atom);
  } catch {
    res.status(500).json({ error: "Failed to generate Atom feed" });
  }
});

router.get("/feed.json", async (req: Request, res: Response) => {
  try {
    const origin = getOrigin(req);
    const posts = await loadPosts();
    const siteTitle = getSiteTitle();
    const siteDescription = getSiteDescription();
    const authorName = getAuthorName(posts);

    const payload = {
      version: "https://jsonfeed.org/version/1.1",
      title: siteTitle,
      home_page_url: origin,
      feed_url: `${origin}/feed.json`,
      description: siteDescription,
      authors: [
        {
          name: authorName,
        },
      ],
      items: posts.map((post) => {
        const canonicalUrl = getCanonicalPostUrl(origin, post.id);
        const visibleText = toVisibleText(post);
        const summary = summarize(visibleText);

        return {
          id: canonicalUrl,
          url: canonicalUrl,
          title: summary || `Post ${post.id}`,
          summary,
          content_html:
            post.contentFormat === "html" ? post.content : `<p>${xmlEscape(post.content)}</p>`,
          content_text: visibleText,
          date_published: post.createdAt,
        };
      }),
    };

    res.type("application/feed+json; charset=utf-8");
    res.json(payload);
  } catch {
    res.status(500).json({ error: "Failed to generate JSON feed" });
  }
});

function buildMf2Export(origin: string, posts: FeedPost[]) {
  const authorName = getAuthorName(posts);

  return {
    items: posts.map((post) => {
      const canonicalUrl = getCanonicalPostUrl(origin, post.id);
      const visibleText = toVisibleText(post);
      const summary = summarize(visibleText);
      const contentHtml =
        post.contentFormat === "html" ? post.content : `<p>${xmlEscape(post.content)}</p>`;

      return {
        type: ["h-entry"],
        properties: {
          name: [summary || `Post ${post.id}`],
          content: [
            {
              html: contentHtml,
              value: visibleText,
            },
          ],
          url: [canonicalUrl],
          published: [post.createdAt],
          author: [
            {
              type: ["h-card"],
              properties: {
                name: [authorName],
                url: [origin],
              },
            },
          ],
        },
      };
    }),
  };
}

router.get("/export/json", async (req: Request, res: Response) => {
  try {
    const origin = getOrigin(req);
    const posts = await loadPosts();
    res.type("application/json; charset=utf-8");
    res.json(buildMf2Export(origin, posts));
  } catch {
    res.status(500).json({ error: "Failed to generate export" });
  }
});

router.get("/export.json", async (req: Request, res: Response) => {
  try {
    const origin = getOrigin(req);
    const posts = await loadPosts();
    res.type("application/json; charset=utf-8");
    res.json(buildMf2Export(origin, posts));
  } catch {
    res.status(500).json({ error: "Failed to generate export" });
  }
});

export default router;
