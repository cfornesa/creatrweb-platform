import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import CategoryDetailPage from "@/pages/category-detail";

/**
 * Smoke coverage for the `/categories/:slug` archive page. The
 * generated category hooks are mocked so this exercise is pure render
 * logic — branding header, post list, owner-only "Manage" affordance.
 */

const userHolder: { isOwner: boolean } = { isOwner: false };

vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({
    currentUser: userHolder.isOwner
      ? { id: "u1", role: "owner", name: "Owner" }
      : null,
    isLoading: false,
    isAuthenticated: userHolder.isOwner,
    isOwner: userHolder.isOwner,
  }),
}));

vi.mock("@/components/post/PostCard", () => ({
  PostCard: ({ post }: { post: { content: string } }) => (
    <div data-testid="post-card">{post.content}</div>
  ),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetCategory: () => ({
    data: {
      id: 7,
      slug: "photography",
      name: "Photography",
      description: "Snapshots from the road",
      postCount: 1,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    isLoading: false,
    isError: false,
  }),
  useGetCategoryPosts: () => ({
    data: {
      posts: [
        {
          id: 101,
          authorId: "alice",
          authorName: "Alice",
          authorImageUrl: null,
          content: "A photo post",
          contentFormat: "plain",
          status: "published",
          sourceFeedId: null,
          sourceFeedName: null,
          sourceCanonicalUrl: null,
          createdAt: "2024-02-01T00:00:00.000Z",
          commentCount: 0,
          categories: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    },
    isLoading: false,
    isError: false,
  }),
  getGetCategoryQueryKey: (slug: string) => ["category", slug],
  getGetCategoryPostsQueryKey: (slug: string, params: unknown) => [
    "category-posts",
    slug,
    params,
  ],
}));

function renderAt(url: string) {
  window.history.replaceState(null, "", url);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router>
        <CategoryDetailPage />
      </Router>
    </QueryClientProvider>,
  );
}

describe("CategoryDetailPage", () => {
  it("renders the category header, description, and post list", () => {
    userHolder.isOwner = false;
    renderAt("/categories/photography");
    expect(screen.getByText("Photography")).toBeInTheDocument();
    expect(screen.getByText("Snapshots from the road")).toBeInTheDocument();
    expect(screen.getByText("1 post")).toBeInTheDocument();
    expect(screen.getByText("A photo post")).toBeInTheDocument();
    expect(screen.queryByTestId("manage-categories-link")).toBeNull();
  });

  it("shows the owner-only Manage categories link when the viewer is the owner", () => {
    userHolder.isOwner = true;
    renderAt("/categories/photography");
    const link = screen.getByTestId("manage-categories-link");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/settings#categories");
  });
});
