import { useEffect } from "react";
import { useParams } from "wouter";
import {
  useGetPageBySlug,
  getGetPageBySlugQueryKey,
} from "@workspace/api-client-react";
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
        ) : null}
      </header>
      <PostContent
        content={page.content}
        contentFormat={page.contentFormat as "html"}
      />
    </article>
  );
}
