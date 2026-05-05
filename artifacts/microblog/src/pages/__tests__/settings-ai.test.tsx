import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import SettingsPage from "@/pages/settings";

const updateMeMutate = vi.fn();
const mockCurrentUser = {
  id: "owner-1",
  name: "Owner",
  username: "owner",
  bio: "Bio",
  website: "https://example.com",
  socialLinks: {},
};
const mockSiteSettings = {
  theme: "bauhaus",
  palette: "bauhaus",
};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

vi.mock("@workspace/api-client-react", () => ({
  useUpdateMe: () => ({
    mutate: updateMeMutate,
    isPending: false,
  }),
  getGetMeQueryKey: () => ["me"],
}));

vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({
    currentUser: mockCurrentUser,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-site-settings", () => ({
  useSiteSettings: () => ({
    data: mockSiteSettings,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/components/layout/UserPageCustomizationCard", () => ({
  UserPageCustomizationCard: () => <div data-testid="user-theme-card" />,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Router>
        <SettingsPage />
      </Router>
    </QueryClientProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    updateMeMutate.mockReset();
  });

  it("does not render the old AI assistant card", () => {
    renderPage();

    expect(screen.queryByText("AI Writing Assistant")).toBeNull();
    expect(screen.getByText("Profile Information")).toBeInTheDocument();
  });

  it("still submits profile updates", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.clear(screen.getByLabelText("Bio"));
    await user.type(screen.getByLabelText("Bio"), "Updated bio");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(updateMeMutate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bio: "Updated bio",
      }),
    });
  });
});
