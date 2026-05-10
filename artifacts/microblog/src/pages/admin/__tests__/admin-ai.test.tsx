import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminAiPage from "@/pages/admin/admin-ai";

const updateAiMutate = vi.fn();
const toastSpy = vi.fn();
const mockAiSettings = {
  availableVendors: [
    { id: "openrouter", label: "OpenRouter" },
    { id: "opencode-zen", label: "Opencode Zen" },
    { id: "opencode-go", label: "Opencode Go" },
    { id: "google", label: "Google" },
  ],
  preferredArtPieceVendor: null,
  settings: [
    { vendor: "openrouter", vendorLabel: "OpenRouter", enabled: false, configured: false, model: null },
    { vendor: "opencode-zen", vendorLabel: "Opencode Zen", enabled: false, configured: false, model: null },
    { vendor: "opencode-go", vendorLabel: "Opencode Go", enabled: false, configured: false, model: null },
    { vendor: "google", vendorLabel: "Google", enabled: true, configured: true, model: "gemini-2.5-flash" },
  ],
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

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
  useGetMyAiSettings: () => ({
    data: mockAiSettings,
    isLoading: false,
  }),
  getGetMyAiSettingsQueryKey: () => ["ai-settings"],
  useUpdateMyAiSettings: (options?: any) => ({
    mutate: (payload: unknown) => {
      updateAiMutate(payload);
      options?.mutation?.onSuccess?.(mockAiSettings);
    },
    isPending: false,
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminAiPage />
    </QueryClientProvider>,
  );
}

describe("AdminAiPage", () => {
  beforeEach(() => {
    updateAiMutate.mockReset();
    toastSpy.mockReset();
  });

  it("renders one section per supported vendor", () => {
    renderPage();

    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    expect(screen.getByText("Opencode Zen")).toBeInTheDocument();
    expect(screen.getByText("Opencode Go")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
  });

  it("blocks enabling a vendor without an API key on first setup", async () => {
    const user = userEvent.setup();
    renderPage();

    const openrouterSection = screen.getByText("OpenRouter").closest("section");
    expect(openrouterSection).not.toBeNull();
    await user.click(within(openrouterSection!).getByRole("checkbox"));
    await user.type(within(openrouterSection!).getByLabelText("Model Slug"), "anthropic/claude-sonnet-4.5");
    await user.click(screen.getByRole("button", { name: "Save AI Settings" }));

    expect(updateAiMutate).not.toHaveBeenCalled();
    expect(screen.getByText("OpenRouter requires an API key before it can be enabled.")).toBeInTheDocument();
  });

  it("submits per-vendor settings", async () => {
    const user = userEvent.setup();
    renderPage();

    const openrouterSection = screen.getByText("OpenRouter").closest("section");
    expect(openrouterSection).not.toBeNull();
    await user.click(within(openrouterSection!).getByRole("checkbox"));
    await user.type(within(openrouterSection!).getByLabelText("Model Slug"), "anthropic/claude-sonnet-4.5");
    await user.type(within(openrouterSection!).getByLabelText("API Key"), "sk-openrouter");
    await user.click(screen.getByRole("button", { name: "Save AI Settings" }));

    expect(updateAiMutate).toHaveBeenCalledWith({
      data: {
        settings: expect.arrayContaining([
          expect.objectContaining({
            vendor: "openrouter",
            enabled: true,
            model: "anthropic/claude-sonnet-4.5",
            apiKey: "sk-openrouter",
          }),
        ]),
      },
    });
  });
});
