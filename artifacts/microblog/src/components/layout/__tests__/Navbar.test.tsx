import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";

class NoopRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error -- jsdom polyfill
globalThis.ResizeObserver = globalThis.ResizeObserver ?? NoopRO;

const navHolder: { current: any[] } = { current: [] };
const userHolder: { current: { isAuthenticated: boolean; currentUser: any; isOwner?: boolean } } = {
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
  SearchBar: ({ embed, compact }: { embed?: boolean; compact?: boolean }) => (
    <div
      data-testid={
        compact
          ? "searchbar-compact"
          : embed
            ? "searchbar-embed"
            : "searchbar-inline"
      }
    />
  ),
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

  it("keeps the search bar inline on desktop even when the hamburger is needed", () => {
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [
      { id: 30, label: "Docs", url: "https://x.example/docs", openInNewTab: true, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: 31, label: "Community", url: "https://x.example/community", openInNewTab: true, sortOrder: 1, createdAt: "", updatedAt: "" },
      { id: 32, label: "Showcase", url: "https://x.example/showcase", openInNewTab: true, sortOrder: 2, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(false);

    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    const ow = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(80);

    renderNavbar();
    expect(screen.getByTestId("navbar-hamburger")).toBeTruthy();
    // The desktop SearchBar is rendered inline (mocked stub testid).
    expect(screen.getByTestId("searchbar-inline")).toBeTruthy();
    // The compact (mobile-centered) variant must NOT be rendered on desktop.
    expect(screen.queryByTestId("searchbar-compact")).toBeNull();

    cw.mockRestore();
    ow.mockRestore();
  });

  it("never renders the same nav link both inline and inside the open hamburger Sheet", async () => {
    const user = userEvent.setup();
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [
      { id: 40, label: "Feeds", url: "/feeds", openInNewTab: false, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: 41, label: "Docs", url: "/docs", openInNewTab: false, sortOrder: 1, createdAt: "", updatedAt: "" },
      { id: 42, label: "About", url: "/about", openInNewTab: false, sortOrder: 2, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(false);

    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    const ow = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(80);

    renderNavbar();
    await user.click(screen.getByTestId("navbar-hamburger"));

    // Scope the inline lookup to the visible nav strip — the hidden
    // off-screen measurer also renders every link with the same
    // testid for width measurement, but it lives outside this node.
    const inlineNav = screen.getByTestId("navbar-inline-links");
    for (const link of navHolder.current) {
      const inline = inlineNav.querySelector(
        `[data-testid="nav-link-${link.id}-inline"]`,
      );
      const sheet = document.querySelector(
        `[data-testid="nav-link-${link.id}-sheet"]`,
      );
      // The link must be rendered in at most one place — never both.
      expect(inline === null || sheet === null).toBe(true);
      // And every link is rendered in exactly one place (no link is
      // dropped on the floor).
      expect(Boolean(inline) || Boolean(sheet)).toBe(true);
    }

    cw.mockRestore();
    ow.mockRestore();
  });

  it("moves overflow links into the Sheet (not just clipped) when signed in", async () => {
    // Regression: signed-in + overflow used to clip the trailing
    // links because the budget didn't reserve hamburger width.
    // Every nav link must end up rendered EXACTLY ONCE — either
    // inline or in the Sheet, never dropped on the floor.
    const user = userEvent.setup();
    userHolder.current = {
      isAuthenticated: true,
      currentUser: {
        id: "u-overflow",
        name: "User",
        email: "u@example.com",
        username: "user",
        imageUrl: null,
      },
      isOwner: false,
    };
    navHolder.current = [
      { id: 80, label: "Docs", url: "/docs", openInNewTab: false, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: 81, label: "Community", url: "/community", openInNewTab: false, sortOrder: 1, createdAt: "", updatedAt: "" },
      { id: 82, label: "Showcase", url: "/showcase", openInNewTab: false, sortOrder: 2, createdAt: "", updatedAt: "" },
      { id: 83, label: "Pricing", url: "/pricing", openInNewTab: false, sortOrder: 3, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(false);

    // Tight container forces overflow.
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(420);
    const ow = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(80);

    renderNavbar();

    // Hamburger and avatar both render.
    expect(screen.getByTestId("navbar-hamburger")).toBeTruthy();
    expect(screen.getByTestId("navbar-avatar")).toBeTruthy();

    await user.click(screen.getByTestId("navbar-hamburger"));

    const inlineNav = screen.getByTestId("navbar-inline-links");
    for (const link of navHolder.current) {
      const inline = inlineNav.querySelector(
        `[data-testid="nav-link-${link.id}-inline"]`,
      );
      const sheet = document.querySelector(
        `[data-testid="nav-link-${link.id}-sheet"]`,
      );
      // Each link is rendered in exactly one place.
      expect(Boolean(inline) !== Boolean(sheet)).toBe(true);
    }

    cw.mockRestore();
    ow.mockRestore();
  });

  it("keeps the avatar inline on desktop even when overflow forces a hamburger", () => {
    userHolder.current = {
      isAuthenticated: true,
      currentUser: {
        id: "u1",
        name: "User",
        email: "u@example.com",
        username: "user",
        imageUrl: null,
      },
      isOwner: false,
    };
    navHolder.current = [
      { id: 50, label: "Docs", url: "/docs", openInNewTab: false, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: 51, label: "Community", url: "/community", openInNewTab: false, sortOrder: 1, createdAt: "", updatedAt: "" },
      { id: 52, label: "Showcase", url: "/showcase", openInNewTab: false, sortOrder: 2, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(false);

    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    const ow = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(80);

    renderNavbar();
    expect(screen.getByTestId("navbar-hamburger")).toBeTruthy();
    expect(screen.getByTestId("navbar-avatar")).toBeTruthy();

    cw.mockRestore();
    ow.mockRestore();
  });

  it("hides the hamburger on a roomy desktop and pins the auth button to the right edge", () => {
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [
      { id: 60, label: "Docs", url: "/docs", openInNewTab: false, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: 61, label: "About", url: "/about", openInNewTab: false, sortOrder: 1, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(false);

    // Roomy desktop: 1400px container, modest 80px reserved widgets.
    // With ~140px logo + ~0px avatar (signed out) + ~250px search +
    // 2 small links + ~150px auth, everything should fit inline.
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1400);
    const ow = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(80);

    renderNavbar();

    // No hamburger should render — there's enough room for everything.
    expect(screen.queryByTestId("navbar-hamburger")).toBeNull();
    // The inline auth button takes the right-edge slot.
    const right = screen.getByTestId("navbar-right");
    const authInline = screen.getByTestId("navbar-auth-inline");
    expect(right.contains(authInline)).toBe(true);
    // Three zones are present.
    expect(screen.getByTestId("navbar-left")).toBeTruthy();
    expect(screen.getByTestId("navbar-center")).toBeTruthy();

    cw.mockRestore();
    ow.mockRestore();
  });

  it("hides the hamburger on a roomy desktop when signed in and pins the avatar to the right edge", () => {
    userHolder.current = {
      isAuthenticated: true,
      currentUser: {
        id: "u9",
        name: "User",
        email: "u@example.com",
        username: "user",
        imageUrl: null,
      },
      isOwner: false,
    };
    navHolder.current = [
      { id: 70, label: "Docs", url: "/docs", openInNewTab: false, sortOrder: 0, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(false);

    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1400);
    const ow = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(80);

    renderNavbar();

    expect(screen.queryByTestId("navbar-hamburger")).toBeNull();
    const right = screen.getByTestId("navbar-right");
    const avatar = screen.getByTestId("navbar-avatar");
    expect(right.contains(avatar)).toBe(true);

    cw.mockRestore();
    ow.mockRestore();
  });

  it("renders a hamburger and zero inline search bars on mobile (search lives only in the Sheet)", async () => {
    // The mobile center zone used to render a `<SearchBar compact />`
    // alongside the hamburger, which collided with the hamburger
    // button at narrow widths. The fix removes the inline search on
    // mobile so search is reachable only by opening the Sheet.
    const user = userEvent.setup();
    userHolder.current = { isAuthenticated: false, currentUser: null };
    navHolder.current = [
      { id: 1, label: "Docs", url: "https://example.com/docs", openInNewTab: true, sortOrder: 0, createdAt: "", updatedAt: "" },
      { id: 2, label: "Blog", url: "/blog", openInNewTab: false, sortOrder: 1, createdAt: "", updatedAt: "" },
    ];
    setMatchMedia(true);
    renderNavbar();
    expect(screen.getByTestId("navbar-hamburger")).toBeTruthy();
    // Mobile must NOT render the compact searchbar in the navbar
    // center zone — the second one used to overlap the hamburger.
    expect(screen.queryByTestId("searchbar-compact")).toBeNull();
    // Center zone exists but is empty.
    const center = screen.getByTestId("navbar-center");
    expect(center.querySelector('[data-testid^="searchbar-"]')).toBeNull();

    // Opening the hamburger surfaces the embedded SearchBar inside
    // the Sheet — that's the single source of search on mobile.
    await user.click(screen.getByTestId("navbar-hamburger"));
    expect(screen.getByTestId("searchbar-embed")).toBeTruthy();
  });
});
