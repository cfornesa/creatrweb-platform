import { act } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import SearchPage from "@/pages/search";

// Tests can stuff fake results into this array between renders. The mocked
// `useSearchPosts` reads it on each call so individual cases can render a
// result list without spinning up a real API client.
const mockSearchResults: { posts: unknown[]; total: number } = {
  posts: [],
  total: 0,
};

vi.mock("@workspace/api-client-react", () => {
  class ApiError extends Error {
    status: number;
    data: unknown;
    constructor(status: number, data: unknown) {
      super(`api error ${status}`);
      this.status = status;
      this.data = data;
    }
  }
  return {
    ApiError,
    useSearchPosts: (params: Record<string, unknown>) => ({
      data: {
        posts: mockSearchResults.posts,
        total: mockSearchResults.total,
        params,
      },
      isLoading: false,
      isError: false,
      error: null,
    }),
    useListPublicFeedSources: () => ({
      data: { sources: [] },
      isLoading: false,
      isError: false,
      error: null,
    }),
    useListCategories: () => ({
      data: { categories: [] },
      isLoading: false,
      isError: false,
      error: null,
    }),
    getSearchPostsQueryKey: (params: Record<string, unknown>) => [
      "search-posts",
      params,
    ],
    getListPublicFeedSourcesQueryKey: () => ["public-feed-sources"],
    getListCategoriesQueryKey: () => ["categories"],
  };
});

function renderAt(url: string) {
  // Set the URL before render so wouter's `useSearch` reads from it
  // on the first render (it's wired through `useSyncExternalStore`
  // over `popstate` / `pushState` / `replaceState`).
  window.history.replaceState(null, "", url);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Router>
        <SearchPage />
      </Router>
    </QueryClientProvider>,
  );
}

describe("SearchPage query-string subscription", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/search");
    mockSearchResults.posts = [];
    mockSearchResults.total = 0;
  });

  it("re-renders when only the URL query string changes", async () => {
    renderAt("/search?q=hello");

    // The initial query renders an active-filter chip with the q.
    const chips = screen.getByTestId("active-filters");
    expect(chips.textContent).toContain("hello");

    // Simulate a header search button submit while already on
    // /search: only the query string changes. Without subscribing to
    // `useSearch`, the page would not re-render and the chip would
    // still say "hello". This is the regression we fixed.
    await act(async () => {
      window.history.pushState(null, "", "/search?q=world");
    });

    const chipsAfter = screen.getByTestId("active-filters");
    expect(chipsAfter.textContent).toContain("world");
    expect(chipsAfter.textContent).not.toContain("hello");
  });

  it("reflects chip-removal navigations (q cleared) immediately", async () => {
    renderAt("/search?q=hello");
    expect(screen.queryByTestId("active-filters")).not.toBeNull();

    await act(async () => {
      window.history.pushState(null, "", "/search");
    });

    // No filters left — the chip strip should be gone.
    expect(screen.queryByTestId("active-filters")).toBeNull();
  });

  it("forwards the active query to result links as ?q=...", () => {
    mockSearchResults.posts = [
      {
        id: 42,
        authorId: "u1",
        authorName: "Author",
        authorImageUrl: null,
        content: "hello world",
        contentFormat: "plain",
        commentCount: 0,
        createdAt: new Date().toISOString(),
        snippet: "hello <mark>world</mark>",
        sourceCanonicalUrl: null,
        sourceFeedId: null,
        sourceFeedName: null,
      },
    ];
    mockSearchResults.total = 1;

    renderAt("/search?q=hello%20world");

    const card = screen.getByTestId("search-result-42");
    const openLink = Array.from(card.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "Open post",
    );
    expect(openLink).toBeDefined();
    // The query is URL-encoded so a multi-token search round-trips
    // through the detail page.
    expect(openLink?.getAttribute("href")).toBe(
      "/posts/42?q=hello%20world",
    );
  });

  it("omits ?q= on result links when the query is empty", () => {
    mockSearchResults.posts = [
      {
        id: 7,
        authorId: "u1",
        authorName: "Author",
        authorImageUrl: null,
        content: "hi",
        contentFormat: "plain",
        commentCount: 0,
        createdAt: new Date().toISOString(),
        snippet: "hi",
        sourceCanonicalUrl: null,
        sourceFeedId: null,
        sourceFeedName: null,
      },
    ];
    mockSearchResults.total = 1;

    // No `q` in the URL — the link should be a bare `/posts/:id`.
    renderAt("/search?author=Author");

    const card = screen.getByTestId("search-result-7");
    const openLink = Array.from(card.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "Open post",
    );
    expect(openLink?.getAttribute("href")).toBe("/posts/7");
  });
});
