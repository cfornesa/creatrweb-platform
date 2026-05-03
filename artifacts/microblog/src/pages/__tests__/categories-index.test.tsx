import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";

const listHolder: {
  data: { categories: Array<unknown> } | undefined;
  isLoading: boolean;
} = { data: undefined, isLoading: false };

vi.mock("@workspace/api-client-react", () => ({
  useListCategories: () => ({
    data: listHolder.data,
    isLoading: listHolder.isLoading,
  }),
  getListCategoriesQueryKey: () => ["categories"],
}));

const { default: CategoriesIndexPage } = await import("@/pages/categories");

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Router>
        <CategoriesIndexPage />
      </Router>
    </QueryClientProvider>,
  );
}

describe("CategoriesIndexPage", () => {
  it("shows a loading state while the categories query is pending", () => {
    listHolder.data = undefined;
    listHolder.isLoading = true;
    renderPage();
    expect(screen.getByText(/Loading categories/i)).toBeInTheDocument();
  });

  it("renders the empty state when no categories exist", () => {
    listHolder.data = { categories: [] };
    listHolder.isLoading = false;
    renderPage();
    expect(screen.getByTestId("categories-index-empty")).toBeInTheDocument();
  });

  it("renders one card per category with detail link, Atom URL, and JSON URL", () => {
    listHolder.data = {
      categories: [
        {
          id: 1,
          slug: "photography",
          name: "Photography",
          description: "Snapshots from the road",
          postCount: 3,
        },
        {
          id: 2,
          slug: "notes",
          name: "Notes",
          description: null,
          postCount: 0,
        },
      ],
    };
    listHolder.isLoading = false;
    renderPage();

    expect(
      screen.getByTestId("categories-index-link-photography").getAttribute("href"),
    ).toBe("/categories/photography");
    expect(
      screen
        .getByTestId("categories-index-atom-photography")
        .getAttribute("href"),
    ).toBe("/categories/photography/feed.xml");
    expect(
      screen
        .getByTestId("categories-index-json-photography")
        .getAttribute("href"),
    ).toBe("/categories/photography/feed.json");

    // Empty categories still appear (the owner controls the
    // taxonomy; an empty bucket isn't a bug).
    expect(screen.getByTestId("categories-index-link-notes")).toBeInTheDocument();
    expect(screen.getByText("/categories/notes · 0 posts")).toBeInTheDocument();
    expect(screen.getByText("/categories/photography · 3 posts")).toBeInTheDocument();
  });
});
