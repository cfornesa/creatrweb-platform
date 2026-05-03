import { useEffect } from "react";
import { useParams } from "wouter";
import {
  useGetPageBySlug,
  getGetPageBySlugQueryKey,
} from "@workspace/api-client-react";
import { Rss } from "lucide-react";
import { PostContent } from "@/components/post/PostContent";
import NotFound from "@/pages/not-found";

export default function PageDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug || "");

  const query = useGetPageBySlug(slug, {
    query: {
      queryKey: getGetPageBySlugQueryKey(slug),
      enabled: slug.length > 0,
      retry: false,
    },
  });

  useEffect(() => {
    if (query.data?.title) {
      document.title = query.data.title;
    }
  }, [query.data?.title]);

  // Keep <link rel="alternate"> in sync with the active page during
  // SPA navigation. The server already injects these on the initial
  // /p/:slug HTML response so feed-reader auto-discovery works on
  // direct hits; this hook re-syncs when the user navigates between
  // pages without a full reload.
  useEffect(() => {
    if (!slug) return;
    const head = document.head;
    Array.from(
      head.querySelectorAll<HTMLLinkElement>(
        'link[rel="alternate"][data-scope="page"]',
      ),
    ).forEach((el) => el.remove());

    const page = query.data;
    if (!page || page.status !== "published") return;
    const base = `/p/${slug}`;
    const make = (type: string, title: string, href: string) => {
      const link = document.createElement("link");
      link.setAttribute("rel", "alternate");
      link.setAttribute("type", type);
      link.setAttribute("title", title);
      link.setAttribute("href", href);
      link.setAttribute("data-scope", "page");
      head.appendChild(link);
      return link;
    };
    const a = make("application/atom+xml", `Atom feed — ${page.title}`, `${base}/feed.xml`);
    const j = make("application/feed+json", `JSON Feed — ${page.title}`, `${base}/feed.json`);
    return () => {
      a.remove();
      j.remove();
    };
  }, [slug, query.data]);

  if (query.isLoading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <NotFound />;
  }
  const page = query.data;

  return (
    <article className="container mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
        {page.status === "draft" ? (
          <p className="mt-1 text-xs uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Draft (visible to you only)
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={`/p/${slug}/feed.xml`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              data-testid="page-feed-atom-link"
            >
              <Rss className="h-3 w-3" /> Subscribe (Atom)
            </a>
            <a
              href={`/p/${slug}/feed.json`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              data-testid="page-feed-json-link"
            >
              <Rss className="h-3 w-3" /> JSON Feed
            </a>
          </div>
        )}
      </header>
      <PostContent
        content={page.content}
        contentFormat={page.contentFormat as "html"}
      />
    </article>
  );
}
