import { useRoute, Link } from "wouter";
import { Tag, ChevronLeft, ChevronRight, Settings, Rss } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/post/PostCard";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  useGetCategory,
  useGetCategoryPosts,
  getGetCategoryQueryKey,
  getGetCategoryPostsQueryKey,
} from "@workspace/api-client-react";

const PAGE_SIZE = 20;

export default function CategoryDetailPage() {
  const [match, params] = useRoute<{ slug: string }>("/categories/:slug");
  const slug = match ? params!.slug : "";
  const [page, setPage] = useState(1);
  const { isOwner } = useCurrentUser();

  const catQuery = useGetCategory(slug, {
    query: { queryKey: getGetCategoryQueryKey(slug), enabled: Boolean(slug) },
  });
  const postsQuery = useGetCategoryPosts(
    slug,
    { page, limit: PAGE_SIZE },
    {
      query: {
        queryKey: getGetCategoryPostsQueryKey(slug, { page, limit: PAGE_SIZE }),
        enabled: Boolean(slug),
        placeholderData: (prev) => prev,
      },
    },
  );

  // Keep <link rel="alternate"> in sync with the active category for
  // SPA navigation. The server already injects these on the initial
  // /categories/:slug HTML response, so feed-reader auto-discovery
  // works for direct hits; this keeps them correct as the user
  // navigates between categories without a full page load.
  useEffect(() => {
    if (!slug) return;
    const head = document.head;
    const previous = Array.from(
      head.querySelectorAll<HTMLLinkElement>(
        'link[rel="alternate"][data-scope="category"]',
      ),
    );
    previous.forEach((el) => el.remove());

    const cat = catQuery.data;
    if (!cat) return;
    const base = `/categories/${slug}`;
    const make = (type: string, title: string, href: string) => {
      const link = document.createElement("link");
      link.setAttribute("rel", "alternate");
      link.setAttribute("type", type);
      link.setAttribute("title", title);
      link.setAttribute("href", href);
      link.setAttribute("data-scope", "category");
      head.appendChild(link);
      return link;
    };
    const a = make("application/atom+xml", `Atom feed — ${cat.name}`, `${base}/feed.xml`);
    const j = make("application/feed+json", `JSON Feed — ${cat.name}`, `${base}/feed.json`);
    return () => {
      a.remove();
      j.remove();
    };
  }, [slug, catQuery.data]);

  if (!match) return null;

  if (catQuery.isLoading) {
    return <div className="container mx-auto max-w-3xl px-4 py-16 text-center">Loading…</div>;
  }
  if (catQuery.isError || !catQuery.data) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Category not found</h1>
        <p className="text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">Back home</Link>
        </p>
      </div>
    );
  }

  const cat = catQuery.data;
  const posts = postsQuery.data?.posts ?? [];
  const total = postsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground inline-flex items-center gap-1">
          <Tag className="h-3.5 w-3.5" /> Category
        </p>
        <h1 className="text-3xl font-bold mt-1">{cat.name}</h1>
        {cat.description ? (
          <p className="text-muted-foreground mt-2">{cat.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground mt-2">
          {cat.postCount} {cat.postCount === 1 ? "post" : "posts"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={`/categories/${slug}/feed.xml`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            data-testid="category-feed-atom-link"
          >
            <Rss className="h-3 w-3" /> Subscribe (Atom)
          </a>
          <a
            href={`/categories/${slug}/feed.json`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            data-testid="category-feed-json-link"
          >
            <Rss className="h-3 w-3" /> JSON Feed
          </a>
          {isOwner ? (
            <Link
              href="/settings#categories"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              data-testid="manage-categories-link"
            >
              <Settings className="h-3 w-3" /> Manage categories
            </Link>
          ) : null}
        </div>
      </div>

      {posts.length === 0 && !postsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          No published posts in this category yet.
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

