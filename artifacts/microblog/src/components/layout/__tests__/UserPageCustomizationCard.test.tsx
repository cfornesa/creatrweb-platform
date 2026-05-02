import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SiteSettings, UserProfile } from "@workspace/api-client-react";
import { UserPageCustomizationCard } from "@/components/layout/UserPageCustomizationCard";
import { getPalette } from "@/lib/site-themes";

const mutateMock = vi.fn();

vi.mock("@workspace/api-client-react", async () => {
  return {
    useUpdateMe: () => ({ mutate: mutateMock, isPending: false }),
    getGetMeQueryKey: () => ["me"],
    getGetUserQueryKey: (id: string) => ["user", id],
  };
});

function buildSiteSettings(): SiteSettings {
  const bauhaus = getPalette("bauhaus")!.colors;
  return {
    theme: "bauhaus",
    palette: "bauhaus",
    siteTitle: "Site",
    heroHeading: "h",
    heroSubheading: "s",
    aboutHeading: "a",
    aboutBody: "b",
    copyrightLine: "c",
    footerCredit: "f",
    ctaLabel: "cta",
    ctaHref: "/",
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
  } as SiteSettings;
}

function buildUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "u1",
    name: "Test",
    username: "test",
    imageUrl: null,
    bio: null,
    website: null,
    socialLinks: null,
    postCount: 0,
    theme: null,
    palette: null,
    colorBackground: null,
    colorForeground: null,
    colorBackgroundDark: null,
    colorForegroundDark: null,
    colorPrimary: null,
    colorPrimaryForeground: null,
    colorSecondary: null,
    colorSecondaryForeground: null,
    colorAccent: null,
    colorAccentForeground: null,
    colorMuted: null,
    colorMutedForeground: null,
    colorDestructive: null,
    colorDestructiveForeground: null,
    ...overrides,
  } as UserProfile;
}

function renderCard(user: UserProfile = buildUser()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserPageCustomizationCard user={user} siteSettings={buildSiteSettings()} />
    </QueryClientProvider>,
  );
}

describe("UserPageCustomizationCard", () => {
  it("falls back to the site palette/theme when the user has no customization", () => {
    renderCard();
    const bauhaus = getPalette("bauhaus")!.colors;
    const primaryInput = screen.getByLabelText("Primary", {
      selector: "input#color-colorPrimary",
    }) as HTMLInputElement;
    expect(primaryInput.value).toBe(bauhaus.colorPrimary);
  });

  it("preserves custom edits when switching palettes (smart merge)", async () => {
    const user = userEvent.setup();
    renderCard();
    const customHsl = "270 60% 50%";

    const primaryInput = screen.getByLabelText("Primary", {
      selector: "input#color-colorPrimary",
    }) as HTMLInputElement;
    await user.clear(primaryInput);
    await user.type(primaryInput, customHsl);
    expect(primaryInput.value).toBe(customHsl);

    const oceanButton = screen.getByRole("button", { name: /Ocean/i });
    await user.click(oceanButton);
    expect(oceanButton).toHaveAttribute("aria-pressed", "true");

    const primaryAfter = screen.getByLabelText("Primary", {
      selector: "input#color-colorPrimary",
    }) as HTMLInputElement;
    expect(primaryAfter.value).toBe(customHsl);

    // Untouched stock color did move to Ocean.
    const ocean = getPalette("ocean")!.colors;
    const secondaryAfter = screen.getByLabelText("Secondary", {
      selector: "input#color-colorSecondary",
    }) as HTMLInputElement;
    expect(secondaryAfter.value).toBe(ocean.colorSecondary);
  });

  it("submits theme + palette + the 14 color fields to PATCH /users/me", async () => {
    const user = userEvent.setup();
    mutateMock.mockClear();
    renderCard();

    const oceanButton = screen.getByRole("button", { name: /Ocean/i });
    await user.click(oceanButton);

    const saveButton = screen.getByRole("button", { name: /Save profile theme/i });
    await user.click(saveButton);

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const callArg = mutateMock.mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    expect(callArg.data.theme).toBeDefined();
    expect(callArg.data.palette).toBe("ocean");
    // All 14 color fields should be present and non-empty.
    const colorKeys = [
      "colorBackground",
      "colorForeground",
      "colorBackgroundDark",
      "colorForegroundDark",
      "colorPrimary",
      "colorPrimaryForeground",
      "colorSecondary",
      "colorSecondaryForeground",
      "colorAccent",
      "colorAccentForeground",
      "colorMuted",
      "colorMutedForeground",
      "colorDestructive",
      "colorDestructiveForeground",
    ];
    for (const key of colorKeys) {
      expect(typeof callArg.data[key]).toBe("string");
      expect(callArg.data[key].length).toBeGreaterThan(0);
    }
  });

  it("disables the clear button when the user has no saved customization", () => {
    renderCard();
    const clearButton = screen.getByRole("button", { name: /Clear my customization/i });
    expect(clearButton).toBeDisabled();
  });

  it("clears every theme column with explicit nulls when a customized user clicks 'Clear my customization'", async () => {
    const user = userEvent.setup();
    mutateMock.mockClear();
    // Render with a user who already has a saved per-profile theme.
    renderCard(
      buildUser({
        theme: "nature",
        palette: "ocean",
        colorPrimary: "270 60% 50%",
      }),
    );

    const clearButton = screen.getByRole("button", { name: /Clear my customization/i });
    expect(clearButton).not.toBeDisabled();
    await user.click(clearButton);

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const payload = mutateMock.mock.calls[0]?.[0]?.data;
    expect(payload).toBeDefined();
    // Every one of the 16 theme columns is sent as explicit null so the
    // server-side UPDATE writes SQL NULL and the user's profile reverts
    // to inheriting the site theme.
    const themeKeys = [
      "theme",
      "palette",
      "colorBackground",
      "colorForeground",
      "colorBackgroundDark",
      "colorForegroundDark",
      "colorPrimary",
      "colorPrimaryForeground",
      "colorSecondary",
      "colorSecondaryForeground",
      "colorAccent",
      "colorAccentForeground",
      "colorMuted",
      "colorMutedForeground",
      "colorDestructive",
      "colorDestructiveForeground",
    ];
    for (const key of themeKeys) {
      expect(payload).toHaveProperty(key);
      expect(payload[key]).toBeNull();
    }
  });
});
