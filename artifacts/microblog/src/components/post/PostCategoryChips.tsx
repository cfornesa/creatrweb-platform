import { Link } from "wouter";
import { Tag } from "lucide-react";
import type { Category } from "@workspace/api-client-react";

/**
 * Dense chip row rendered under a post byline. Each chip links to
 * `/categories/<slug>`; the row is hidden entirely when the post has
 * no categories so empty space doesn't push the body down.
 */
export function PostCategoryChips({ categories }: { categories?: Category[] | null }) {
  if (!categories || categories.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Tag className="h-3 w-3" />
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/categories/${c.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-full border border-border px-2 py-0.5 hover:bg-accent hover:text-foreground transition-colors z-10"
          data-testid={`post-category-chip-${c.slug}`}
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}
