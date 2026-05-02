import { useRoute, Link } from "wouter";
import { Tag, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { useState } from "react";
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
        {isOwner ? (
          <Link
            href="/settings#categories"
            className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            data-testid="manage-categories-link"
          >
            <Settings className="h-3 w-3" /> Manage categories
          </Link>
        ) : null}
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

