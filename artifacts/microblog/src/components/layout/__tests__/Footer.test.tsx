import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const settingsHolder: { current: any } = { current: null };
vi.mock("@/hooks/use-site-settings", () => ({
  useSiteSettings: () => ({ data: settingsHolder.current }),
}));
vi.mock("@workspace/api-client-react", () => ({
  useHealthCheck: () => ({ data: { status: "ok" } }),
  getHealthCheckQueryKey: () => ["health"],
}));

const { Footer } = await import("@/components/layout/Footer");

describe("Footer", () => {
  it("renders nothing in the social row when no owner social_links/website are set", () => {
    settingsHolder.current = {
      copyrightLine: "Acme",
      ownerSocialLinks: {},
      ownerWebsite: null,
    };
    render(<Footer />);
    expect(screen.queryByTestId("footer-social-row")).toBeNull();
    expect(screen.getByText(/Acme/)).toBeTruthy();
  });

  it("renders an icon for each known platform plus the website globe", () => {
    settingsHolder.current = {
      copyrightLine: "",
      ownerSocialLinks: {
        instagram: "https://instagram.com/me",
        twitter: "https://x.com/me",
        bogus: "https://nope.example",
      },
      ownerWebsite: "https://me.example",
    };
    render(<Footer />);
    const row = screen.getByTestId("footer-social-row");
    expect(row).toBeTruthy();
    expect(screen.getByTestId("footer-social-instagram")).toBeTruthy();
    expect(screen.getByTestId("footer-social-twitter")).toBeTruthy();
    expect(screen.queryByTestId("footer-social-bogus")).toBeNull();
    const globe = screen.getByTestId("footer-social-globe") as HTMLAnchorElement;
    expect(globe.getAttribute("href")).toBe("https://me.example");
    expect(globe.getAttribute("target")).toBe("_blank");
    expect(globe.getAttribute("rel")).toContain("noopener");
    expect(screen.getByTestId("footer-divider")).toBeTruthy();
    expect(screen.getByTestId("footer-api-health")).toBeTruthy();
  });
});
