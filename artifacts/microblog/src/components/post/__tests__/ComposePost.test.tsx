import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComposePost } from "@/components/post/ComposePost";

const mockAiSettings = {
  settings: [],
};

vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({
    currentUser: { id: "owner-1", name: "Owner", imageUrl: null },
    isOwner: true,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useCreatePost: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUploadMedia: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useGetMyAiSettings: () => ({
    data: mockAiSettings,
  }),
  getGetMyAiSettingsQueryKey: () => ["ai-settings"],
  getListPostsQueryKey: () => ["posts"],
  getGetPostsByUserQueryKey: () => ["posts-by-user"],
  getGetFeedStatsQueryKey: () => ["feed-stats"],
}));

vi.mock("@/components/post/RichPostEditor", () => ({
  RichPostEditor: ({ aiVendors }: { aiVendors?: Array<{ id: string }> }) => (
    <div data-testid="rich-editor">{aiVendors?.length ? "ai-on" : "ai-off"}</div>
  ),
}));

function renderComposePost() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ComposePost />
    </QueryClientProvider>,
  );
}

describe("ComposePost AI gating", () => {
  beforeEach(() => {
    mockAiSettings.settings = [];
  });

  it("keeps AI unavailable when settings are disabled or incomplete", async () => {
    const user = userEvent.setup();
    renderComposePost();

    await user.click(screen.getByRole("button", { name: /Start a post/i }));
    expect(screen.getByTestId("rich-editor").textContent).toBe("ai-off");
  });

  it("enables AI in the editor when settings are enabled and configured", async () => {
    const user = userEvent.setup();
    mockAiSettings.settings = [
      {
        vendor: "opencode-zen",
        vendorLabel: "Opencode Zen",
        enabled: true,
        configured: true,
        model: "big-pickle",
      },
    ];
    renderComposePost();

    await user.click(screen.getByRole("button", { name: /Start a post/i }));
    expect(screen.getByTestId("rich-editor").textContent).toBe("ai-on");
  });
});
