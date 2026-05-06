import { Link, useSearch } from "wouter";
import { useListSiteFeeds, getListSiteFeedsQueryKey, type SiteFeed } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Rss, FileJson, Database, ExternalLink, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ICONS: Record<string, typeof Rss> = {
  atom: Rss,
  json: FileJson,
  mf2: Database,
};

function pickIcon(slug: string): typeof Rss {
  if (slug.endsWith("-atom")) return Rss;
  if (slug.endsWith("-json")) return FileJson;
  return ICONS[slug] ?? Rss;
}

type FeedGroup = {
  heading: string;
  type: "sitewide" | "category" | "page";
  feeds: SiteFeed[];
};

const SITEWIDE_SLUGS = new Set(["atom", "json", "mf2"]);

function groupFeeds(feeds: SiteFeed[]): FeedGroup[] {
  const groups: FeedGroup[] = [];

  const sitewide = feeds.filter((f) => SITEWIDE_SLUGS.has(f.slug));
  if (sitewide.length > 0) {
    groups.push({ heading: "Site Feeds", type: "sitewide", feeds: sitewide });
  }

  const categoryMap = new Map<string, SiteFeed[]>();
  for (const feed of feeds) {
    if (!feed.slug.startsWith("category-")) continue;
    const catSlug = feed.slug.replace(/^category-/, "").replace(/-(?:atom|json)$/, "");
    if (!categoryMap.has(catSlug)) categoryMap.set(catSlug, []);
    categoryMap.get(catSlug)!.push(feed);
  }
  for (const catFeeds of categoryMap.values()) {
    const atomEntry = catFeeds.find((f) => f.slug.endsWith("-atom"));
    const heading = atomEntry?.title.replace(/^Atom feed — /, "") ?? "Category";
    groups.push({ heading, type: "category", feeds: catFeeds });
  }

  const pageMap = new Map<string, SiteFeed[]>();
  for (const feed of feeds) {
    if (!feed.slug.startsWith("page-")) continue;
    const pgSlug = feed.slug.replace(/^page-/, "").replace(/-(?:atom|json)$/, "");
    if (!pageMap.has(pgSlug)) pageMap.set(pgSlug, []);
    pageMap.get(pgSlug)!.push(feed);
  }
  for (const pageFeedGroup of pageMap.values()) {
    const atomEntry = pageFeedGroup.find((f) => f.slug.endsWith("-atom"));
    const heading = atomEntry?.title.replace(/^Atom feed — /, "") ?? "Page";
    groups.push({ heading, type: "page", feeds: pageFeedGroup });
  }

  return groups;
}

export default function FeedsIndexPage() {
  const { toast } = useToast();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const categorySlug = params.get("category") ?? undefined;
  const pageSlug = params.get("page") ?? undefined;
  const list = useListSiteFeeds(
    { ...(categorySlug ? { category: categorySlug } : {}), ...(pageSlug ? { page: pageSlug } : {}) },
    {
      query: {
        queryKey: getListSiteFeedsQueryKey({
          ...(categorySlug ? { category: categorySlug } : {}),
          ...(pageSlug ? { page: pageSlug } : {}),
        }),
        staleTime: 60_000,
      },
    },
  );
  const feeds = list.data?.feeds ?? [];

  return (
    <div className="container mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Subscribable feeds</h1>
        <p className="mt-2 text-muted-foreground">
          Paste any of these URLs into your feed reader to follow new posts.
          The first two are also auto-discovered by every page on this site
          via standard <code className="rounded bg-muted px-1 py-0.5 text-xs">&lt;link rel=&quot;alternate&quot;&gt;</code> tags.
        </p>
      </header>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading feeds…</p>
      ) : feeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feeds available.</p>
      ) : (
        <div className="space-y-10" data-testid="feeds-index-list">
          {groupFeeds(feeds).map((group) => (
            <section key={group.heading}>
              <h2 className="mb-4 text-lg font-semibold tracking-tight">{group.heading}</h2>
              <ul className="space-y-4">
                {group.feeds.map((feed) => {
                  const Icon = pickIcon(feed.slug);
                  const displayTitle =
                    group.type !== "sitewide" ? feed.title.replace(/ — .*$/, "") : feed.title;
                  return (
                    <li key={feed.slug}>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Icon className="h-5 w-5 text-primary" />
                            {displayTitle}
                          </CardTitle>
                          <CardDescription>{feed.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-2">
                            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
                              {feed.url}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(feed.url);
                                  toast({ title: "Copied", description: feed.url });
                                } catch {
                                  toast({
                                    title: "Couldn't copy",
                                    description: "Select the URL and copy manually.",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            >
                              <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                            </Button>
                            <Button asChild size="sm" variant="secondary">
                              <a href={feed.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open
                              </a>
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            MIME: <code>{feed.mimeType}</code>
                          </p>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-10 text-xs text-muted-foreground">
        New to feed readers?{" "}
        <a
          href="https://aboutfeeds.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          About Feeds
        </a>{" "}
        explains how to start. Or browse{" "}
        <Link href="/" className="underline">
          the timeline
        </Link>{" "}
        directly.
      </p>
    </div>
  );
}
