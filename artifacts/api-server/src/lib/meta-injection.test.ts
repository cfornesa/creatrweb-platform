import { describe, expect, it } from "vitest";
import {
  buildScopeKey,
  buildUserThemeCss,
  userHasCustomization,
} from "./meta-injection";

describe("buildScopeKey", () => {
  it("prefixes a UUID id with `user-` unchanged", () => {
    expect(buildScopeKey("6953bb74-768e-4ee8-9159-464e3450e0a2")).toBe(
      "user-6953bb74-768e-4ee8-9159-464e3450e0a2",
    );
  });

  it("strips characters that would break out of a CSS attribute selector", () => {
    expect(buildScopeKey('abc"]><script>x()</script>')).toBe("user-abcscriptxscript");
  });

  it("returns null for an empty id", () => {
    expect(buildScopeKey("")).toBeNull();
  });

  it("returns null for an id with no safe characters", () => {
    expect(buildScopeKey("!@#$%^&*()")).toBeNull();
  });
});

describe("userHasCustomization", () => {
  it("returns false for a fully-empty user", () => {
    expect(userHasCustomization({})).toBe(false);
  });

  it("returns true when the user has a known theme id", () => {
    expect(userHasCustomization({ theme: "ocean" })).toBe(false); // ocean isn't a theme id
    expect(userHasCustomization({ theme: "nature" })).toBe(true);
  });

  it("ignores invalid HSL color values", () => {
    expect(
      userHasCustomization({ colorBackground: "</style><script>alert(1)</script>" }),
    ).toBe(false);
    expect(userHasCustomization({ colorBackground: "not-an-hsl" })).toBe(false);
  });

  it("returns true for a single valid HSL color", () => {
    expect(userHasCustomization({ colorBackground: "200 100% 90%" })).toBe(true);
  });
});

describe("buildUserThemeCss", () => {
  const scope = "user-abc";

  it("emits nothing when no fields are set", () => {
    expect(buildUserThemeCss({}, scope)).toBe("");
  });

  it("scopes light variables to the attribute selector and includes derived ones", () => {
    const css = buildUserThemeCss(
      {
        colorBackground: "200 100% 90%",
        colorForeground: "200 30% 10%",
        colorPrimary: "200 80% 40%",
        colorSecondary: "300 50% 50%",
      },
      scope,
    );
    expect(css).toContain('[data-user-theme-scope="user-abc"]');
    expect(css).toContain("--background: 200 100% 90%;");
    expect(css).toContain("--card: 200 100% 90%;");
    expect(css).toContain("--popover: 200 100% 90%;");
    expect(css).toContain("--input: 200 100% 90%;");
    expect(css).toContain("--foreground: 200 30% 10%;");
    expect(css).toContain("--card-foreground: 200 30% 10%;");
    expect(css).toContain("--primary: 200 80% 40%;");
    expect(css).toContain("--secondary: 300 50% 50%;");
    expect(css).toContain("--ring: 300 50% 50%;");
  });

  it("emits a separate dark-mode block under `.dark` ancestor", () => {
    const css = buildUserThemeCss(
      {
        colorBackgroundDark: "200 30% 10%",
        colorForegroundDark: "200 100% 90%",
      },
      scope,
    );
    expect(css).toMatch(
      /\.dark \[data-user-theme-scope="user-abc"\][^,]*,\s*\[data-user-theme-scope="user-abc"\]\.dark/,
    );
    expect(css).toContain("--background: 200 30% 10%;");
    expect(css).toContain("--foreground: 200 100% 90%;");
  });

  it("rejects malicious values that try to break out of <style> (no XSS)", () => {
    const css = buildUserThemeCss(
      {
        colorBackground: "</style><script>alert(1)</script>",
        colorPrimary: "0; }</style><script>x()</script><style>{",
        // a legitimate value is still emitted
        colorForeground: "10 20% 30%",
      },
      scope,
    );
    expect(css).not.toContain("</style>");
    expect(css).not.toContain("<script>");
    expect(css).not.toContain("alert");
    expect(css).toContain("--foreground: 10 20% 30%;");
    expect(css).not.toContain("--background:");
    expect(css).not.toContain("--primary:");
  });

  it("rejects oversized color values", () => {
    const giant = "1 ".repeat(50) + "100% 50%";
    const css = buildUserThemeCss({ colorBackground: giant }, scope);
    expect(css).toBe("");
  });

  it("ignores non-string values", () => {
    const css = buildUserThemeCss(
      {
        colorBackground: null,
        colorForeground: undefined,
        colorPrimary: "200 80% 40%",
      },
      scope,
    );
    expect(css).toContain("--primary: 200 80% 40%;");
    expect(css).not.toContain("--background:");
    expect(css).not.toContain("--foreground:");
  });
});
