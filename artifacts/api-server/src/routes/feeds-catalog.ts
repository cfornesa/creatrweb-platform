// Hand-maintained catalog of subscribable site feeds rendered at /feeds.
import { Router, type IRouter, type Request, type Response } from "express";

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

router.get("/feeds", (req: Request, res: Response) => {
  const origin = getOrigin(req);
  return res.json({
    feeds: FEEDS.map((feed) => ({
      slug: feed.slug,
      title: feed.title,
      description: feed.description,
      url: `${origin}${feed.path}`,
      mimeType: feed.mimeType,
    })),
  });
});

export default router;
