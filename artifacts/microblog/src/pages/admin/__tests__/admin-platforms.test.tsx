import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminPlatformsPage from "@/pages/admin/admin-platforms";

const toastSpy = vi.fn();
const upsertAppMutate = vi.fn();

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

vi.mock("wouter", () => ({
  useSearch: () => "",
}));

vi.mock("@/components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({
    currentUser: { id: "owner-1", role: "owner" },
    isOwner: true,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListPlatformConnections: () => ({
    data: { connections: [] },
    isLoading: false,
  }),
  getListPlatformConnectionsQueryKey: () => ["platform-connections"],
  useCreatePlatformConnection: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUpdatePlatformConnection: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useDeletePlatformConnection: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useListPlatformOAuthApps: () => ({
    data: {
      apps: [
        { platform: "wordpress_com", configured: true, blogUrl: "https://wrong.example.wordpress.com" },
        { platform: "blogger", configured: false, blogUrl: null },
      ],
    },
    isLoading: false,
  }),
  getListPlatformOAuthAppsQueryKey: () => ["platform-oauth-apps"],
  useUpsertPlatformOAuthApp: () => ({
    mutate: upsertAppMutate,
    isPending: false,
  }),
  useGetSiteSettings: () => ({
    data: { allowedOrigins: ["https://platform.example.com"] },
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPlatformsPage />
    </QueryClientProvider>,
  );
}

describe("AdminPlatformsPage", () => {
  beforeEach(() => {
    toastSpy.mockReset();
    upsertAppMutate.mockReset();
  });

  it("shows a recovery path when app credentials are saved but OAuth is not connected", async () => {
    const user = userEvent.setup();
    renderPage();

    const wordpressCard = screen.getByText("WordPress.com").closest(".rounded-xl");
    expect(wordpressCard).not.toBeNull();
    expect(screen.getByText("App saved")).toBeInTheDocument();
    expect(screen.getByText("Saved app settings found. Review or replace them before reconnecting.")).toBeInTheDocument();
    expect(within(wordpressCard!).getByRole("button", { name: "Edit saved app settings" })).toBeInTheDocument();
    expect(within(wordpressCard!).getByRole("button", { name: "Connect" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit saved app settings" }));

    expect(screen.getByText(/Saved app credentials already exist for this platform/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://wrong.example.wordpress.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace saved credentials & connect" })).toBeInTheDocument();
  });

  it("replaces saved app credentials before reconnecting", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit saved app settings" }));
    await user.type(screen.getByLabelText("Client ID"), "client-id-123");
    await user.type(screen.getByLabelText("Client Secret"), "secret-456");
    await user.clear(screen.getByLabelText("Your blog URL"));
    await user.type(screen.getByLabelText("Your blog URL"), "https://correct.example.wordpress.com");
    await user.click(screen.getByRole("button", { name: "Replace saved credentials & connect" }));

    expect(upsertAppMutate).toHaveBeenCalledWith(
      {
        platform: "wordpress_com",
        data: {
          clientId: "client-id-123",
          clientSecret: "secret-456",
          blogUrl: "https://correct.example.wordpress.com",
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });
});
