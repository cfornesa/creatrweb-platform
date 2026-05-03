import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";

class NoopRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error -- jsdom polyfill
globalThis.ResizeObserver = globalThis.ResizeObserver ?? NoopRO;

const navHolder: { current: any[] } = { current: [] };
const userHolder: { current: { isAuthenticated: boolean; currentUser: any } } = {
  current: { isAuthenticated: false, currentUser: null },
};

vi.mock("@workspace/api-client-react", () => ({
  useListNavLinks: () => ({ data: { links: navHolder.current } }),
  getListNavLinksQueryKey: () => ["listNavLinks"],
}));
vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => userHolder.current,
}));
vi.mock("@/hooks/use-site-settings", () => ({
  useSiteSettings: () => ({ data: { siteTitle: "Test" } }),
}));
vi.mock("@/lib/auth", () => ({ signOut: async () => undefined }));
vi.mock("@/components/layout/SearchBar", () => ({
  SearchBar: () => <div data-testid="searchbar-stub" />,
}));

const { Navbar } = await import("@/components/layout/Navbar");

function setMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as any;
}

function renderNavbar() {
  return render(
    <Router>
      <Navbar />
    </Router>,
  );
}

describe("Navbar", () => {
  it("does not loop when nav-links query is still loading and layout widths are nonzero", () => {
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [];
    setMatchMedia(false);
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    const ow = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(120);
    expect(() => renderNavbar()).not.toThrow();
    cw.mockRestore();
    ow.mockRestore();
  });

  it("shows a single 'Log in / Register' button when guest (no twin Sign In + Get Started)", () => {
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [];
    setMatchMedia(false);
    renderNavbar();
    const matches = screen.getAllByText(/Log in \/ Register/i);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^Sign In$/)).toBeNull();
    expect(screen.queryByText(/^Get Started$/)).toBeNull();
  });

  it("hides the hamburger trigger on desktop when there are no nav links", () => {
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [];
    setMatchMedia(false);
    renderNavbar();
    expect(screen.queryByTestId("navbar-hamburger")).toBeNull();
  });

  it("collapses to hamburger when measured inline content overflows the container", async () => {
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [
      { id: 10, label: "Docs", url: "https://x.example/docs", openInNewTab: true, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: 11, label: "Community", url: "https://x.example/community", openInNewTab: true, sortOrder: 1, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(false);

    const containerWidthSpy = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(320);
    const offsetWidthSpy = vi
      .spyOn(HTMLElement.prototype, "offsetWidth", "get")
      .mockReturnValue(120);

    const { unmount } = renderNavbar();
    expect(screen.getByTestId("navbar-hamburger")).toBeTruthy();

    unmount();
    containerWidthSpy.mockRestore();
    offsetWidthSpy.mockRestore();
  });

  it("collapses inline search and auth into the hamburger when links overflow on desktop", async () => {
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [
      { id: 30, label: "Docs", url: "https://x.example/docs", openInNewTab: true, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: 31, label: "Community", url: "https://x.example/community", openInNewTab: true, sortOrder: 1, createdAt: "", updatedAt: "" },
      { id: 32, label: "Showcase", url: "https://x.example/showcase", openInNewTab: true, sortOrder: 2, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(false);

    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(520);
    const ow = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(160);

    renderNavbar();
    expect(screen.getByTestId("navbar-hamburger")).toBeTruthy();
    expect(screen.queryByTestId("header-search")).toBeNull();
    const inlineLogin = screen
      .queryAllByRole("button", { name: /Log in \/ Register/i })
      .filter((el) => !el.closest('[aria-hidden="true"]'));
    expect(inlineLogin.length).toBe(0);

    cw.mockRestore();
    ow.mockRestore();
  });

  it("renders inline nav links and a hamburger when nav links exist on mobile", () => {
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [
      { id: 1, label: "Docs", url: "https://example.com/docs", openInNewTab: true, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: 2, label: "Blog", url: "/blog", openInNewTab: false, sortOrder: 1, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(true);
    renderNavbar();
    expect(screen.getByTestId("navbar-hamburger")).toBeTruthy();
  });
});
