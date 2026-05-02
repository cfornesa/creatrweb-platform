import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SiteSettings } from "@workspace/api-client-react";
import { SiteCustomizationCard } from "@/components/layout/SiteCustomizationCard";
import { getPalette } from "@/lib/site-themes";

vi.mock("@workspace/api-client-react", async () => {
  return {
    useUpdateSiteSettings: () => ({
      mutate: vi.fn(),
      isPending: false,
    }),
    getGetSiteSettingsQueryKey: () => ["site-settings"],
  };
});

function buildBauhausSettings(overrides: Partial<SiteSettings> = {}): SiteSettings {
  const bauhaus = getPalette("bauhaus")!.colors;
  return {
    theme: "bauhaus",
    palette: "bauhaus",
    siteTitle: "Test Site",
    heroHeading: "Hello",
    heroSubheading: "Sub",
    aboutHeading: "About",
    aboutBody: "Body",
    copyrightLine: "Tester",
    footerCredit: "Credit",
    ctaLabel: "CTA",
    ctaHref: "/cta",
    colorBackground: bauhaus.colorBackground,
    colorForeground: bauhaus.colorForeground,
    colorBackgroundDark: bauhaus.colorBackgroundDark,
    colorForegroundDark: bauhaus.colorForegroundDark,
    colorPrimary: bauhaus.colorPrimary,
    colorPrimaryForeground: bauhaus.colorPrimaryForeground,
    colorSecondary: bauhaus.colorSecondary,
    colorSecondaryForeground: bauhaus.colorSecondaryForeground,
    colorAccent: bauhaus.colorAccent,
    colorAccentForeground: bauhaus.colorAccentForeground,
    colorMuted: bauhaus.colorMuted,
    colorMutedForeground: bauhaus.colorMutedForeground,
    colorDestructive: bauhaus.colorDestructive,
    colorDestructiveForeground: bauhaus.colorDestructiveForeground,
    ...overrides,
  } as SiteSettings;
}

function renderCard(settings: SiteSettings) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SiteCustomizationCard settings={settings} />
    </QueryClientProvider>,
  );
}

describe("SiteCustomizationCard palette switching", () => {
  it("preserves a customized color field's HSL value when switching palettes", async () => {
    const user = userEvent.setup();
    renderCard(buildBauhausSettings());

    const customHsl = "200 80% 40%";
    const primaryInput = screen.getByLabelText("Primary", {
      selector: "input#color-colorPrimary",
    }) as HTMLInputElement;

    await user.clear(primaryInput);
    await user.type(primaryInput, customHsl);
    expect(primaryInput.value).toBe(customHsl);

    // Switch palette: Bauhaus → Ocean. Use the palette card button which
    // has its label as accessible text.
    const oceanButton = screen.getByRole("button", { name: /Ocean/i });
    await user.click(oceanButton);

    // Active palette should now be Ocean (aria-pressed=true).
    expect(oceanButton).toHaveAttribute("aria-pressed", "true");

    // The customized colorPrimary field is preserved.
    const primaryAfter = screen.getByLabelText("Primary", {
      selector: "input#color-colorPrimary",
    }) as HTMLInputElement;
    expect(primaryAfter.value).toBe(customHsl);

    // Other (un-customized) stock fields should have moved to the Ocean values.
    const ocean = getPalette("ocean")!.colors;
    const secondaryAfter = screen.getByLabelText("Secondary", {
      selector: "input#color-colorSecondary",
    }) as HTMLInputElement;
    expect(secondaryAfter.value).toBe(ocean.colorSecondary);
  });
});
