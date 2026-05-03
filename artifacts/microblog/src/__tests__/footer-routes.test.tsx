import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

vi.mock("@/hooks/use-site-settings", () => ({
  useSiteSettings: () => ({
    data: {
      siteTitle: "Test",
      copyrightLine: "Acme",
      footerCredit: "Made with care",
      ownerSocialLinks: { instagram: "https://instagram.com/me" },
      ownerWebsite: null,
    },
  }),
}));
vi.mock("@workspace/api-client-react", () => ({
  useHealthCheck: () => ({ data: { status: "ok" } }),
  getHealthCheckQueryKey: () => ["health"],
}));

const { Footer } = await import("@/components/layout/Footer");

function renderAt(path: string) {
  const { hook } = memoryLocation({ path });
  return render(
    <Router hook={hook}>
      <main />
      <Footer />
    </Router>,
  );
}

describe("Footer on multiple routes", () => {
  beforeEach(() => cleanup());

  for (const path of ["/", "/settings", "/posts/123", "/search?q=x", "/categories/general"]) {
    it(`renders the footer at ${path}`, () => {
      renderAt(path);
      expect(screen.getByTestId("site-footer")).toBeTruthy();
      expect(screen.getByTestId("footer-api-health")).toBeTruthy();
      expect(screen.getByText(/Acme/)).toBeTruthy();
    });
  }
});
