import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Search, X, ChevronLeft, ChevronRight, Rss, ExternalLink } from "lucide-react";
import {
  useSearchPosts,
  useListPublicFeedSources,
  useListCategories,
  getListPublicFeedSourcesQueryKey,
  getListCategoriesQueryKey,
  getSearchPostsQueryKey,
  ApiError,
  type SearchPost,
  type SearchPostsParams,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatPostDate } from "@/lib/format-date";
import { getRecentSearches, recordRecentSearch } from "@/lib/recent-searches";

const PAGE_SIZE = 20;

/**
 * `/search` results page.
 *
 * URL is the source of truth for every filter so results are
 * shareable, bookmarkable, and survive the browser back/forward
 * buttons. The local component state mirrors the URL on every
 * render — when the user toggles a filter we push a new URL and
 * rerender from it, instead of carrying separate "draft" state.
 *
 * The query and snippet rendering are owned by the server
 * (`/api/posts/search`); this page just renders the response.
 */

type Filters = {
  q: string;
  from: string;
  to: string;
  sources: string[]; // includes the literal "native"
  /** Category slugs (OR semantics, mirrors `sources`). */
  categories: string[];
  author: string;
  formats: Array<"html" | "plain">;
  page: number;
};

function parseFiltersFromSearch(search: string): Filters {
  const params = new URLSearchParams(search);
  const sourcesRaw = params.get("sources") ?? "";
  const formatsRaw = params.get("format") ?? "";
  const sources = sourcesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const categoriesRaw = params.get("categories") ?? "";
  const categories = categoriesRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const formats = formatsRaw
    .split(",")
    .map((f) => f.trim().toLowerCase())
    .filter((f): f is "html" | "plain" => f === "html" || f === "plain");
  const pageRaw = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    q: params.get("q") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    sources,
    categories,
    author: params.get("author") ?? "",
    formats,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };
}

function filtersToSearchString(f: Filters): string {
  const params = new URLSearchParams();
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  if (f.sources.length > 0) params.set("sources", f.sources.join(","));
  if (f.categories.length > 0) params.set("categories", f.categories.join(","));
  if (f.author.trim()) params.set("author", f.author.trim());
  // Both formats checked == no filter; only push the param when the
  // selection is meaningful (exactly one).
  if (f.formats.length === 1) params.set("format", f.formats[0]);
  if (f.page > 1) params.set("page", String(f.page));
  return params.toString();
}

function filtersToSearchParams(f: Filters): SearchPostsParams {
  const params: SearchPostsParams = { page: f.page, limit: PAGE_SIZE };
  if (f.q.trim()) params.q = f.q.trim();
  if (f.from) params.from = f.from;
  if (f.to) params.to = f.to;
  if (f.sources.length > 0) params.sources = f.sources.join(",");
  if (f.categories.length > 0) params.categories = f.categories.join(",");
  if (f.author.trim()) params.author = f.author.trim();
  if (f.formats.length === 1) params.format = f.formats[0];
  return params;
}

export default function SearchPage() {
  const [, setLocation] = useLocation();
  // wouter's `useLocation` only subscribes to the pathname, but every
  // interaction on this page is a query-string-only navigation
  // (filters, paging, header search submits to /search?q=…). Subscribe
  // to the search string directly via `useSearch` so any `?…`-only
  // URL change re-renders the page. `useSearch` is built on the same
  // popstate / pushState / replaceState listeners as `useLocation`,
  // so back/forward keep working.
  const search = useSearch();
  const filters = useMemo(() => parseFiltersFromSearch(search), [search]);

  // Local mirror so we can debounce text inputs without firing a
  // navigation per keystroke. On filter "commit" (Enter, blur, or
  // checkbox change) we push to the URL.
  const [localQ, setLocalQ] = useState(filters.q);
  const [localAuthor, setLocalAuthor] = useState(filters.author);
  useEffect(() => {
    setLocalQ(filters.q);
    setLocalAuthor(filters.author);
  }, [filters.q, filters.author]);

  function pushFilters(next: Partial<Filters>) {
    const merged: Filters = {
      ...filters,
      ...next,
      // Any filter change resets pagination — otherwise we could land
      // on a page that no longer exists in the new result set.
      page: next.page !== undefined ? next.page : 1,
    };
    const qs = filtersToSearchString(merged);
    setLocation(qs ? `/search?${qs}` : `/search`);
  }

  // Public digest of feed sources that have at least one published
  // post. Available to every visitor — the endpoint returns only id
  // and name, so it doesn't leak owner-only subscription metadata.
  const sourcesQuery = useListPublicFeedSources({
    query: { queryKey: getListPublicFeedSourcesQueryKey() },
  });
  const feedSources = sourcesQuery.data?.sources ?? [];

  const categoriesQuery = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });
  const allCategories = categoriesQuery.data?.categories ?? [];

  const toggleCategory = (slug: string, checked: boolean) => {
    const set = new Set(filters.categories);
    if (checked) set.add(slug);
    else set.delete(slug);
    pushFilters({ categories: Array.from(set) });
  };

  const searchParams = filtersToSearchParams(filters);
  const results = useSearchPosts(searchParams, {
    // `placeholderData: (prev) => prev` is the v5 spelling of the
    // legacy `keepPreviousData` flag — it keeps the old result on
    // screen while the new query for a tweaked filter is in flight,
    // so the page doesn't flash empty between keystrokes.
    query: {
      queryKey: getSearchPostsQueryKey(searchParams),
      placeholderData: (prev) => prev,
    },
  });

  const posts: SearchPost[] = results.data?.posts ?? [];
  const total = results.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Per-browser recent search history, kept in component state so the
  // empty-state panel re-renders the moment a new entry is recorded.
  // Initialised lazily so SSR/test environments without `localStorage`
  // don't crash on first render.
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    getRecentSearches(),
  );

  // Remember successful searches so we can suggest them back when a
  // future search comes up empty. We only record once results land
  // (and only when the query was non-empty) so empty submits and
  // in-flight keystrokes don't pollute the history.
  useEffect(() => {
    if (!filters.q.trim()) return;
    if (results.isLoading || results.isError) return;
    recordRecentSearch(filters.q);
    setRecentSearches(getRecentSearches());
  }, [filters.q, results.isLoading, results.isError, results.data]);

  // Build the empty-state suggestion list: recent searches first
  // (most relevant for recovery), then a few of the most-used
  // categories on the site as "popular tags." Cap at 5 so the panel
  // stays compact. Skip whatever the visitor already typed.
  //
  // Recent suggestions re-run as free-text queries, but tag
  // suggestions apply the category slug filter — that way a tag whose
  // name doesn't appear in any post body still surfaces its posts
  // (the empty-state's whole reason to exist).
  type Suggestion =
    | { kind: "recent"; label: string; query: string }
    | { kind: "tag"; label: string; slug: string };
  const suggestions = useMemo<Suggestion[]>(() => {
    const seen = new Set<string>();
    const currentQ = filters.q.trim().toLowerCase();
    if (currentQ) seen.add(`q:${currentQ}`);
    const out: Suggestion[] = [];
    for (const q of recentSearches) {
      const key = `q:${q.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "recent", label: q, query: q });
      if (out.length >= 5) return out;
    }
    const popular = [...allCategories]
      .filter((c) => (c.postCount ?? 0) > 0)
      .sort((a, b) => (b.postCount ?? 0) - (a.postCount ?? 0));
    for (const c of popular) {
      const key = `tag:${c.slug}`;
      if (seen.has(key)) continue;
      // Don't re-suggest a category the visitor has already filtered by.
      if (filters.categories.includes(c.slug)) continue;
      seen.add(key);
      out.push({ kind: "tag", label: c.name, slug: c.slug });
      if (out.length >= 5) return out;
    }
    return out;
  }, [recentSearches, allCategories, filters.q, filters.categories]);

  const formatChecked = (kind: "html" | "plain"): boolean => {
    // Empty == "both" by default, which we render as both checked.
    if (filters.formats.length === 0) return true;
    return filters.formats.includes(kind);
  };

  const toggleFormat = (kind: "html" | "plain", checked: boolean) => {
    const current = filters.formats.length === 0 ? ["html", "plain"] : [...filters.formats];
    let next: Array<"html" | "plain">;
    if (checked) {
      next = Array.from(new Set([...current, kind])) as Array<"html" | "plain">;
    } else {
      next = current.filter((f) => f !== kind) as Array<"html" | "plain">;
    }
    // Unchecking both is equivalent to "either" — collapse to empty
    // so we don't generate a contradictory `format=` URL.
    if (next.length === 2 || next.length === 0) {
      pushFilters({ formats: [] });
    } else {
      pushFilters({ formats: next });
    }
  };

  // The full set of source tokens visible in the UI. Used to render
  // the "all selected" default state and to detect when the user has
  // re-selected everything (which we collapse back to an empty
  // `sources` param so the URL stays clean).
  const allSourceTokens = useMemo(
    () => ["native", ...feedSources.map((s) => String(s.id))],
    [feedSources],
  );
  // Empty `sources` param means "no source filter," which is also the
  // semantic for "all sources." Render that state with every box
  // checked so the UI reflects what the API will actually return.
  const sourcesAllSelected = filters.sources.length === 0;
  const isSourceChecked = (token: string): boolean =>
    sourcesAllSelected || filters.sources.includes(token);

  const toggleSource = (token: string, checked: boolean) => {
    let nextSelected: string[];
    if (sourcesAllSelected) {
      // Currently in the "all" default — unchecking one box means
      // "every source except this one," so seed the explicit list
      // from the full set first.
      nextSelected = allSourceTokens.filter((t) => t !== token);
    } else {
      const set = new Set(filters.sources);
      if (checked) set.add(token);
      else set.delete(token);
      nextSelected = Array.from(set);
    }
    // If the user has re-selected every visible token, collapse back
    // to the empty default so the URL doesn't carry a redundant list
    // and so future visits to /search default to "all" again.
    const isNowAll =
      allSourceTokens.length > 0 &&
      allSourceTokens.every((t) => nextSelected.includes(t));
    pushFilters({ sources: isNowAll ? [] : nextSelected });
  };

  // Active-filter chips. Order matches the sidebar so the relationship
  // is legible. Each chip removes only its own filter on click.
  type Chip = { key: string; label: string; onRemove: () => void };
  const chips: Chip[] = [];
  if (filters.q) {
    chips.push({
      key: "q",
      label: `“${filters.q}”`,
      onRemove: () => pushFilters({ q: "" }),
    });
  }
  if (filters.from) {
    chips.push({
      key: "from",
      label: `from ${filters.from}`,
      onRemove: () => pushFilters({ from: "" }),
    });
  }
  if (filters.to) {
    chips.push({
      key: "to",
      label: `to ${filters.to}`,
      onRemove: () => pushFilters({ to: "" }),
    });
  }
  for (const token of filters.sources) {
    const label =
      token === "native"
        ? "This site's posts"
        : feedSources.find((s) => String(s.id) === token)?.name ?? `source #${token}`;
    chips.push({
      key: `source:${token}`,
      label: `source: ${label}`,
      onRemove: () =>
        pushFilters({ sources: filters.sources.filter((s) => s !== token) }),
    });
  }
  for (const slug of filters.categories) {
    const label = allCategories.find((c) => c.slug === slug)?.name ?? slug;
    chips.push({
      key: `category:${slug}`,
      label: `category: ${label}`,
      onRemove: () =>
        pushFilters({ categories: filters.categories.filter((s) => s !== slug) }),
    });
  }
  if (filters.author) {
    chips.push({
      key: "author",
      label: `author: ${filters.author}`,
      onRemove: () => pushFilters({ author: "" }),
    });
  }
  if (filters.formats.length === 1) {
    chips.push({
      key: "format",
      label: `format: ${filters.formats[0]}`,
      onRemove: () => pushFilters({ formats: [] }),
    });
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
        <Search className="h-7 w-7" /> Search
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Search every published post on this site. Press <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs">/</kbd> from anywhere to focus the header search.
      </p>

      <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
        <aside className="space-y-6" data-testid="search-filters">
          {/* Inline query input — mirror of the header search so the
              page works even when the header is scrolled away on mobile.
              The submit button matches the header behavior so the
              affordance is the same wherever the user is on the page. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              pushFilters({ q: localQ });
            }}
            role="search"
            className="space-y-1.5"
          >
            <Label htmlFor="search-q">Query</Label>
            <div className="flex items-center gap-2">
              <Input
                id="search-q"
                type="search"
                value={localQ}
                onChange={(e) => setLocalQ(e.target.value)}
                placeholder="words to search…"
                enterKeyHint="search"
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                data-testid="search-page-submit"
              >
                Search
              </Button>
            </div>
          </form>

          <div className="space-y-3">
            <Label className="block text-sm font-medium">Date range</Label>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="search-from" className="text-xs text-muted-foreground">From</Label>
                <Input
                  id="search-from"
                  type="date"
                  value={filters.from}
                  onChange={(e) => pushFilters({ from: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="search-to" className="text-xs text-muted-foreground">To</Label>
                <Input
                  id="search-to"
                  type="date"
                  value={filters.to}
                  onChange={(e) => pushFilters({ to: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="block text-sm font-medium">Sources</Label>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={isSourceChecked("native")}
                  onCheckedChange={(c) => toggleSource("native", c === true)}
                />
                <span>This site's posts</span>
              </label>
              {feedSources.length === 0 ? (
                <p className="text-xs text-muted-foreground italic pl-6">
                  No syndicated sources yet.
                </p>
              ) : (
                feedSources.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={isSourceChecked(String(s.id))}
                      onCheckedChange={(c) =>
                        toggleSource(String(s.id), c === true)
                      }
                    />
                    <span className="flex items-center gap-1.5 truncate">
                      <Rss className="h-3 w-3 text-muted-foreground" />
                      {s.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {allCategories.length > 0 ? (
            <div className="space-y-2">
              <Label className="block text-sm font-medium">Categories</Label>
              <div className="space-y-1.5 text-sm">
                {allCategories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={filters.categories.includes(c.slug)}
                      onCheckedChange={(v) => toggleCategory(c.slug, v === true)}
                    />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{c.postCount}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              pushFilters({ author: localAuthor });
            }}
            className="space-y-1.5"
          >
            <Label htmlFor="search-author">Original author</Label>
            <Input
              id="search-author"
              type="text"
              value={localAuthor}
              onChange={(e) => setLocalAuthor(e.target.value)}
              onBlur={() => {
                if (localAuthor !== filters.author) {
                  pushFilters({ author: localAuthor });
                }
              }}
              placeholder="contains…"
            />
          </form>

          <div className="space-y-2">
            <Label className="block text-sm font-medium">Content format</Label>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formatChecked("html")}
                  onCheckedChange={(c) => toggleFormat("html", c === true)}
                />
                <span>Rich (HTML)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formatChecked("plain")}
                  onCheckedChange={(c) => toggleFormat("plain", c === true)}
                />
                <span>Plain text</span>
              </label>
            </div>
          </div>
        </aside>

        <section data-testid="search-results">
          {chips.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2" data-testid="active-filters">
              {chips.map((chip) => (
                <Badge
                  key={chip.key}
                  variant="secondary"
                  className="gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={chip.onRemove}
                >
                  {chip.label}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          ) : null}

          {(() => {
            // Distinguish a real server fault (5xx, network) — which
            // is retryable and warrants the alarming red banner —
            // from a client-side validation 4xx, which means a query
            // param needs to be reset (e.g. someone hand-edited
            // `?page=abc` in the URL). The latter shows neutral copy
            // pointing at the offending field.
            const err = results.error;
            const status =
              err instanceof ApiError ? err.status : null;
            const is4xx = status !== null && status >= 400 && status < 500;
            const field =
              err instanceof ApiError &&
              err.data &&
              typeof err.data === "object" &&
              "field" in (err.data as Record<string, unknown>)
                ? String((err.data as Record<string, unknown>).field)
                : null;
            return (
              <p className="text-sm text-muted-foreground mb-3">
                {results.isLoading ? (
                  "Loading…"
                ) : results.isError && !is4xx ? (
                  <span className="text-destructive">
                    Search failed. Please try again in a moment.
                  </span>
                ) : results.isError && is4xx ? (
                  <span>
                    {field
                      ? `Invalid ${field} value — try removing it and searching again.`
                      : "One of the filters is invalid — try removing it and searching again."}
                  </span>
                ) : total === 0 ? (
                  "No posts match."
                ) : (
                  `${total} ${total === 1 ? "match" : "matches"}`
                )}
              </p>
            );
          })()}

          {results.isError ? null : posts.length === 0 && !results.isLoading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Search className="mx-auto h-10 w-10 mb-3 opacity-30" />
                <p>No posts match the current filters.</p>
                {chips.length > 0 ? (
                  <p className="text-xs mt-2">
                    Try removing one of the chips above.
                  </p>
                ) : null}
                {suggestions.length > 0 ? (
                  <div className="mt-6" data-testid="search-suggestions">
                    <p className="text-xs font-medium uppercase tracking-wide mb-2">
                      Try one of these
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {suggestions.map((s) => (
                        <Badge
                          key={s.kind === "recent" ? `q:${s.query}` : `tag:${s.slug}`}
                          variant={s.kind === "recent" ? "secondary" : "outline"}
                          className="cursor-pointer hover:bg-secondary/80"
                          data-testid={`search-suggestion-${s.kind}`}
                          onClick={() => {
                            if (s.kind === "recent") {
                              setLocalQ(s.query);
                              pushFilters({ q: s.query });
                            } else {
                              // Apply the category slug filter directly so
                              // the tag's posts surface even when the
                              // category name isn't in any post body.
                              pushFilters({
                                categories: Array.from(
                                  new Set([...filters.categories, s.slug]),
                                ),
                              });
                            }
                          }}
                        >
                          {s.kind === "tag" ? (
                            <span className="mr-1 opacity-60">#</span>
                          ) : null}
                          {s.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-4">
              {posts.map((post) => (
                <li key={post.id}>
                  <SearchResultCard post={post} query={filters.q} />
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page <= 1}
                onClick={() => pushFilters({ page: filters.page - 1 })}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {filters.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= totalPages}
                onClick={() => pushFilters({ page: filters.page + 1 })}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function SearchResultCard({ post, query }: { post: SearchPost; query: string }) {
  const initials = (post.authorName ?? "?").charAt(0).toUpperCase();
  // Carry the active query through to the post detail page so it can
  // highlight the same terms in the full body.
  const trimmedQuery = query.trim();
  const detailHref = trimmedQuery
    ? `/posts/${post.id}?q=${encodeURIComponent(trimmedQuery)}`
    : `/posts/${post.id}`;
  return (
    <Card data-testid={`search-result-${post.id}`}>
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 border border-border shrink-0">
            <AvatarImage src={post.authorImageUrl ?? undefined} alt={post.authorName} />
            <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <span className="font-medium text-foreground">{post.authorName}</span>
              <span className="text-muted-foreground text-xs">
                · {formatPostDate(post.createdAt)}
              </span>
              {post.sourceFeedName ? (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  · <Rss className="h-3 w-3" /> via {post.sourceFeedName}
                </span>
              ) : null}
            </div>
            {post.categories && post.categories.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {post.categories.map((c) => (
                  <Link
                    key={c.id}
                    href={`/categories/${c.slug}`}
                    className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            ) : null}
            {/* Snippet HTML is server-sanitized: tags stripped, then escaped,
                then `<mark>` wrapped around matched terms. Safe to render. */}
            <p
              className="mt-2 text-sm text-foreground leading-relaxed [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-500/40 [&_mark]:rounded [&_mark]:px-0.5"
              dangerouslySetInnerHTML={{ __html: post.snippet }}
            />
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <Link
                href={detailHref}
                className="text-primary hover:underline"
              >
                Open post
              </Link>
              {post.sourceCanonicalUrl ? (
                <a
                  href={post.sourceCanonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  Original <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
              {post.commentCount > 0 ? (
                <span>
                  {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
