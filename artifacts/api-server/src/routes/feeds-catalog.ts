// Hand-maintained catalog of subscribable site feeds rendered at /feeds.
// Optionally narrowed to a single category via `?category=<slug>`, in
// which case category-scoped Atom + JSON feeds are appended.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, categoriesTable, pagesTable, eq, and } from "@workspace/db";

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto?.split(",")[0]?.trim() || req.protocol;
  const host = req.get("host");
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

  // When a viewer is browsing a category or CMS page the UI may pass
  // `?category=<slug>` or `?page=<slug>` so the catalog also surfaces
  // the per-resource Atom and JSON feeds. Unknown slugs simply fall
  // through to the site-wide list — this endpoint is purely
  // informational.
  const categorySlug =
    typeof req.query.category === "string"
      ? req.query.category.toLowerCase()
      : "";
  const pageSlug =
    typeof req.query.page === "string" ? req.query.page.toLowerCase() : "";
  if (categorySlug) {
    try {
      const rows = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.slug, categorySlug))
        .limit(1);
      const cat = rows[0];
      if (cat) {
        const base = `/categories/${cat.slug}`;
        feeds.push(
          {
            slug: `category-${cat.slug}-atom`,
            title: `Atom feed — ${cat.name}`,
            description: `Posts in the “${cat.name}” category, in Atom 1.0.`,
            url: `${origin}${base}/feed.xml`,
            mimeType: "application/atom+xml",
          },
          {
            slug: `category-${cat.slug}-json`,
            title: `JSON Feed — ${cat.name}`,
            description: `Posts in the “${cat.name}” category, in JSON Feed 1.1.`,
            url: `${origin}${base}/feed.json`,
            mimeType: "application/feed+json",
          },
        );
      }
    } catch {
      // Swallow DB errors — catalog still returns the site-wide feeds.
    }
  }

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
            description: `Updates to the “${page.title}” page, in Atom 1.0.`,
            url: `${origin}${base}/feed.xml`,
            mimeType: "application/atom+xml",
          },
          {
            slug: `page-${page.slug}-json`,
            title: `JSON Feed — ${page.title}`,
            description: `Updates to the “${page.title}” page, in JSON Feed 1.1.`,
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
