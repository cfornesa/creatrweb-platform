import { Link } from "wouter";
import {
  useListCategories,
  getListCategoriesQueryKey,
  type CategoryWithPostCount,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag, Rss, FileJson } from "lucide-react";

export default function CategoriesIndexPage() {
  const list = useListCategories({
    query: { queryKey: getListCategoriesQueryKey(), staleTime: 60_000 },
  });
  const categories: CategoryWithPostCount[] = list.data?.categories ?? [];

  return (
    <div className="container mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
        <p className="mt-2 text-muted-foreground">
          Browse posts grouped by topic. Each category has its own page and
          subscribable feed.
        </p>
      </header>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="categories-index-empty">
          No categories yet.
        </p>
      ) : (
        <ul className="space-y-4" data-testid="categories-index-list">
          {categories.map((category) => (
            <li key={category.id}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Tag className="h-5 w-5 text-primary" />
                    <Link
                      href={`/categories/${category.slug}`}
                      className="hover:underline"
                      data-testid={`categories-index-link-${category.slug}`}
                    >
                      {category.name}
                    </Link>
                  </CardTitle>
                  {category.description ? (
                    <CardDescription>{category.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    /categories/{category.slug} · {category.postCount}{" "}
                    {category.postCount === 1 ? "post" : "posts"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <a
                        href={`/categories/${category.slug}/feed.xml`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`categories-index-atom-${category.slug}`}
                      >
                        <Rss className="mr-1 h-3.5 w-3.5" /> Atom
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <a
                        href={`/categories/${category.slug}/feed.json`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`categories-index-json-${category.slug}`}
                      >
                        <FileJson className="mr-1 h-3.5 w-3.5" /> JSON
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
