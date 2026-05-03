import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router } from "wouter";

const NAV_KEY = ["listNavLinks"] as const;
const NAV_KEY_HIDDEN = ["listNavLinks", { includeHidden: "1" }] as const;
const PAGES_KEY = ["listPages", { includeDrafts: "1" }] as const;

const createState = {
  isPending: false,
  mutate: vi.fn(
    (
      _vars: unknown,
      handlers: { onSuccess?: (data: { id: number; slug: string }) => void },
    ) => handlers.onSuccess?.({ id: 42, slug: "about" }),
  ),
};

const updateState = {
  isPending: false,
  mutate: vi.fn(
    (
      _vars: unknown,
      handlers: { onSuccess?: (data: { id: number; slug: string }) => void },
    ) => handlers.onSuccess?.({ id: 42, slug: "about" }),
  ),
};

const editTargetPage = {
  id: 42,
  slug: "about",
  title: "About",
  content: "hello",
  showInNav: true,
  status: "published" as const,
};

let pagesListData: { pages: Array<typeof editTargetPage> } = { pages: [] };

vi.mock("@workspace/api-client-react", () => ({
  useListPages: () => ({ data: pagesListData, isLoading: false }),
  useCreatePage: () => createState,
  useUpdatePage: () => updateState,
  useUploadMedia: () => ({ isPending: false, mutateAsync: vi.fn() }),
  getListPagesQueryKey: () => PAGES_KEY,
  getGetPageBySlugQueryKey: (slug: string) => ["page-by-slug", slug],
  getListNavLinksQueryKey: (params?: { includeHidden?: string }) =>
    params?.includeHidden ? NAV_KEY_HIDDEN : NAV_KEY,
}));

vi.mock("@/components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/post/RichPostEditor", () => ({
  RichPostEditor: () => <div data-testid="rich-editor" />,
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: () => {} }),
}));

const { default: AdminPageEditor } = await import("@/pages/admin/admin-page-editor");

describe("AdminPageEditor cache invalidation", () => {
  it("invalidates the nav-links query (both keys) on successful create so the navbar refetches", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/admin/pages/new");
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const spy = vi.spyOn(qc, "invalidateQueries");

    render(
      <QueryClientProvider client={qc}>
        <Router>
          <AdminPageEditor />
        </Router>
      </QueryClientProvider>,
    );

    await user.type(screen.getByTestId("page-title-input"), "About");
    await user.click(screen.getByTestId("page-publish-button"));

    await waitFor(() => {
      expect(createState.mutate).toHaveBeenCalled();
    });

    const invalidatedKeys = spy.mock.calls.map((call) => {
      const arg = call[0] as { queryKey: unknown[] } | undefined;
      return JSON.stringify(arg?.queryKey ?? []);
    });
    // Pages list, page-by-slug, and BOTH nav-link variants must
    // each have been invalidated as part of the success path.
    expect(invalidatedKeys).toContain(JSON.stringify(PAGES_KEY));
    expect(invalidatedKeys).toContain(JSON.stringify(["page-by-slug", "about"]));
    expect(invalidatedKeys).toContain(JSON.stringify(NAV_KEY));
    expect(invalidatedKeys).toContain(JSON.stringify(NAV_KEY_HIDDEN));
  });

  it("invalidates the nav-links query (both keys) on successful update so the navbar refetches", async () => {
    const user = userEvent.setup();
    pagesListData = { pages: [editTargetPage] };
    window.history.replaceState(null, "", "/admin/pages/edit/42");
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const spy = vi.spyOn(qc, "invalidateQueries");

    render(
      <QueryClientProvider client={qc}>
        <Router>
          <Route path="/admin/pages/edit/:id" component={AdminPageEditor} />
        </Router>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByTestId("page-publish-button"));

    await waitFor(() => {
      expect(updateState.mutate).toHaveBeenCalled();
    });

    const invalidatedKeys = spy.mock.calls.map((call) => {
      const arg = call[0] as { queryKey: unknown[] } | undefined;
      return JSON.stringify(arg?.queryKey ?? []);
    });
    expect(invalidatedKeys).toContain(JSON.stringify(NAV_KEY));
    expect(invalidatedKeys).toContain(JSON.stringify(NAV_KEY_HIDDEN));

    pagesListData = { pages: [] };
  });
});
