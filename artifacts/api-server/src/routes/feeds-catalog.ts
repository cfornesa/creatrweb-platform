// Hand-maintained catalog of subscribable site feeds rendered at /feeds.
// All categories' Atom + JSON feeds are always included.
// `?page=<slug>` appends per-page feeds when it resolves to a published page.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, categoriesTable, pagesTable, eq, and, asc } from "@workspace/db";

const router: IRouter = Router();

function getOrigin(req: Request): string {
  if (process.env.PUBLIC_SITE_URL) {
    return process.env.PUBLIC_SITE_URL.replace(/\/$/, "").trim();
  }
  const forwardedProto = req.header("x-forwarded-proto");
  const forwardedHost = req.header("x-forwarded-host");
  const protocol = forwardedProto?.split(",")[0]?.trim() || req.protocol;
  const host = forwardedHost?.split(",")[0]?.trim() || req.get("host");
  return `${protocol}://${host}`;
}

const FEEDS = [
  {
    slug: "atom",
    title: "Atom feed",
    description:
      "All published posts in standard Atom 1.0 — paste this URL into any feed reader to subscribe.",
    path: "/feed.xml",
    mimeType: "application/atom+xml",
  },
  {
    slug: "json",
    title: "JSON Feed",
    description:
      "Same posts as the Atom feed, in JSON Feed 1.1 format — handy for clients that prefer JSON.",
    path: "/feed.json",
    mimeType: "application/feed+json",
  },
  {
    slug: "mf2",
    title: "Microformats2 export",
    description:
      "Full portable export with reactions, comments, and category metadata. Useful for backups and migrations.",
    path: "/export.json",
    mimeType: "application/mf2+json",
  },
] as const;

type FeedEntry = {
  slug: string;
  title: string;
  description: string;
  url: string;
  mimeType: string;
};

router.get("/feeds", async (req: Request, res: Response) => {
  const origin = getOrigin(req);
  const feeds: FeedEntry[] = FEEDS.map((feed) => ({
    slug: feed.slug,
    title: feed.title,
    description: feed.description,
    url: `${origin}${feed.path}`,
    mimeType: feed.mimeType,
  }));

  // Always include every category's Atom + JSON feeds so the /feeds
  // page shows them without the caller needing to know each slug.
  // The former ?category=<slug> param is now a no-op (kept for
  // backwards compatibility — existing callers still receive a valid response).
  try {
    const allCategories = await db
      .select({ slug: categoriesTable.slug, name: categoriesTable.name })
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.name));
    for (const cat of allCategories) {
      const base = `/categories/${cat.slug}`;
      feeds.push(
        {
          slug: `category-${cat.slug}-atom`,
          title: `Atom feed — ${cat.name}`,
          description: `Posts in the "${cat.name}" category, in Atom 1.0.`,
          url: `${origin}${base}/feed.xml`,
          mimeType: "application/atom+xml",
        },
        {
          slug: `category-${cat.slug}-json`,
          title: `JSON Feed — ${cat.name}`,
          description: `Posts in the "${cat.name}" category, in JSON Feed 1.1.`,
          url: `${origin}${base}/feed.json`,
          mimeType: "application/feed+json",
        },
      );
    }
  } catch {
    // Swallow DB errors — catalog still returns the site-wide feeds.
  }

  // Per-page feeds are contextual: only appended when a valid published
  // page slug is passed via `?page=<slug>`.
  const pageSlug =
    typeof req.query.page === "string" ? req.query.page.toLowerCase() : "";
  if (pageSlug) {
    try {
      const rows = await db
        .select({ slug: pagesTable.slug, title: pagesTable.title })
        .from(pagesTable)
        .where(and(eq(pagesTable.slug, pageSlug), eq(pagesTable.status, "published")))
        .limit(1);
      const page = rows[0];
      if (page) {
        const base = `/p/${page.slug}`;
        feeds.push(
          {
            slug: `page-${page.slug}-atom`,
            title: `Atom feed — ${page.title}`,
            description: `Updates to the "${page.title}" page, in Atom 1.0.`,
            url: `${origin}${base}/feed.xml`,
            mimeType: "application/atom+xml",
          },
          {
            slug: `page-${page.slug}-json`,
            title: `JSON Feed — ${page.title}`,
            description: `Updates to the "${page.title}" page, in JSON Feed 1.1.`,
            url: `${origin}${base}/feed.json`,
            mimeType: "application/feed+json",
          },
        );
      }
    } catch {
      // Swallow DB errors — catalog still returns the site-wide feeds.
    }
  }

  return res.json({ feeds });
});

export default router;
