import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminPlatformsPage from "@/pages/admin/admin-platforms";

const toastSpy = vi.fn();
const upsertAppMutate = vi.fn();
const createConnectionMutate = vi.fn();
let mockConnections: Array<Record<string, unknown>> = [];

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
    data: { connections: mockConnections },
    isLoading: false,
  }),
  getListPlatformConnectionsQueryKey: () => ["platform-connections"],
  useCreatePlatformConnection: () => ({
    mutate: createConnectionMutate,
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
    createConnectionMutate.mockReset();
    mockConnections = [];
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

  it("opens the Substack dialog with the warning copy and submits credentials", async () => {
    const user = userEvent.setup();
    renderPage();

    const substackCard = screen.getByText("Substack").closest(".rounded-xl");
    expect(substackCard).not.toBeNull();

    await user.click(within(substackCard!).getByRole("button", { name: "Connect" }));

    expect(screen.getByText("WARNING: Unofficial API. Credentials stored in the MySQL platform connections record.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Session cookie"), "cookie-123");
    await user.type(screen.getByLabelText("Publication ID"), "456");
    await user.type(screen.getByLabelText("Publication hostname"), "writer.substack.com");
    await user.click(screen.getByRole("button", { name: "Save & connect" }));

    expect(createConnectionMutate).toHaveBeenCalledWith(
      {
        data: {
          platform: "substack",
          credentials: {
            sessionCookie: "cookie-123",
            publicationId: "456",
            publicationHost: "writer.substack.com",
          },
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("shows the expired-session warning only on the Substack card", () => {
    mockConnections = [
      {
        id: 91,
        platform: "substack",
        configured: true,
        enabled: true,
        metadata: {
          publicationId: "456",
          publicationHost: "writer.substack.com",
          authStatus: "expired",
          statusMessage: "Substack session expired. Update your session cookie to reconnect.",
        },
        createdAt: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
      },
    ];

    renderPage();

    const substackCard = screen.getByText("Substack").closest(".rounded-xl");
    expect(substackCard).not.toBeNull();
    expect(within(substackCard!).getByText("Substack session expired. Update your session cookie to reconnect.")).toBeInTheDocument();
  });

  it("prefills saved Substack hostname and publication id when updating credentials", async () => {
    const user = userEvent.setup();
    mockConnections = [
      {
        id: 92,
        platform: "substack",
        configured: true,
        enabled: true,
        metadata: {
          publicationId: "789",
          publicationHost: "saved.substack.com",
        },
        createdAt: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
      },
    ];

    renderPage();

    const substackCard = screen.getByText("Substack").closest(".rounded-xl");
    expect(substackCard).not.toBeNull();
    await user.click(within(substackCard!).getByRole("button", { name: "Update credentials" }));

    expect(screen.getByDisplayValue("789")).toBeInTheDocument();
    expect(screen.getByDisplayValue("saved.substack.com")).toBeInTheDocument();
  });
});
