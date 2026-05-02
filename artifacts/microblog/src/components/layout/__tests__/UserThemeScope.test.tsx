import { afterEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { UserProfile } from "@workspace/api-client-react";
import { UserThemeScope } from "@/components/layout/UserThemeScope";

afterEach(() => {
  delete (window as unknown as { __USER_THEME_BOOTSTRAP__?: unknown })
    .__USER_THEME_BOOTSTRAP__;
});

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

describe("UserThemeScope", () => {
  it("renders no scope wrapper when user has no theme customization", () => {
    const { container } = render(
      <UserThemeScope user={buildUser()}>
        <p data-testid="child">hello</p>
      </UserThemeScope>,
    );
    // No wrapper with data-user-theme-scope; the child renders at the top level.
    expect(container.querySelector("[data-user-theme-scope]")).toBeNull();
    expect(container.querySelector("style[data-user-theme-scope-style]")).toBeNull();
    expect(container.querySelector("[data-testid='child']")).not.toBeNull();
  });

  it("falls through cleanly when user is undefined (still loading)", () => {
    const { container } = render(
      <UserThemeScope user={undefined}>
        <p>loading</p>
      </UserThemeScope>,
    );
    expect(container.querySelector("[data-user-theme-scope]")).toBeNull();
  });

  it("wraps children in a scoped element with stable attribute and data-theme", () => {
    const { container } = render(
      <UserThemeScope user={buildUser({ theme: "nature" })}>
        <p>kid</p>
      </UserThemeScope>,
    );
    const wrapper = container.querySelector("[data-user-theme-scope]");
    expect(wrapper).not.toBeNull();
    // Stable scope key derived from user.id, never a generated useId value.
    expect(wrapper?.getAttribute("data-user-theme-scope")).toBe("user-u1");
    expect(wrapper?.getAttribute("data-theme")).toBe("nature");
  });

  it("emits a scoped <style> with light + dark variables when colors are set", () => {
    const { container } = render(
      <UserThemeScope
        user={buildUser({
          theme: "ocean",
          colorBackground: "200 100% 90%",
          colorPrimary: "200 80% 40%",
          colorBackgroundDark: "200 30% 10%",
        })}
      >
        <p>kid</p>
      </UserThemeScope>,
    );
    const style = container.querySelector("style[data-user-theme-scope-style]");
    expect(style).not.toBeNull();
    const css = style!.textContent || "";
    expect(css).toContain('[data-user-theme-scope="user-u1"]');
    expect(css).toContain("--background: 200 100% 90%;");
    expect(css).toContain("--primary: 200 80% 40%;");
    // Dark vars piggyback on ancestor .dark.
    expect(css).toMatch(
      /\.dark \[data-user-theme-scope="user-u1"\][^,]*,\s*\[data-user-theme-scope="user-u1"\]\.dark/,
    );
    expect(css).toContain("--background: 200 30% 10%;");
  });

  it("ignores unknown theme ids (renders wrapper but with no data-theme) and keeps valid colors", () => {
    const { container } = render(
      <UserThemeScope
        user={buildUser({ theme: "not-a-real-theme", colorBackground: "0 0% 50%" })}
      >
        <p>kid</p>
      </UserThemeScope>,
    );
    const wrapper = container.querySelector("[data-user-theme-scope]");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("data-theme")).toBeNull();
    expect(container.querySelector("style[data-user-theme-scope-style]")?.textContent).toContain(
      "--background: 0 0% 50%",
    );
  });

  it("rejects malicious color payloads instead of injecting them into <style>", () => {
    // Stored XSS attempt: a color value that tries to break out of <style>
    // and inject a <script>. The component must drop it and emit no rule.
    const evil = "</style><script>alert(1)</script>";
    const { container } = render(
      <UserThemeScope
        user={buildUser({
          colorBackground: evil,
          colorPrimary: "0; }</style><script>x()</script><style>{",
          // A legitimate value alongside the evil ones still flows through.
          colorForeground: "10 20% 30%",
        })}
      >
        <p>kid</p>
      </UserThemeScope>,
    );
    const style = container.querySelector("style[data-user-theme-scope-style]");
    // Only the legitimate color should appear; nothing else.
    const css = style?.textContent || "";
    expect(css).not.toContain("</style>");
    expect(css).not.toContain("<script>");
    expect(css).not.toContain("alert");
    expect(css).toContain("--foreground: 10 20% 30%;");
    expect(css).not.toContain("--background:");
    expect(css).not.toContain("--primary:");
  });

  it("rejects oversized color payloads", () => {
    const giant = "1 ".repeat(50) + "100% 50%";
    const { container } = render(
      <UserThemeScope user={buildUser({ colorBackground: giant })}>
        <p>kid</p>
      </UserThemeScope>,
    );
    expect(container.querySelector("style[data-user-theme-scope-style]")).toBeNull();
    expect(container.querySelector("[data-user-theme-scope]")).toBeNull();
  });

  it("renders the scoped wrapper from the SSR bootstrap before user data loads (no-flash first paint)", () => {
    (window as unknown as { __USER_THEME_BOOTSTRAP__?: unknown }).__USER_THEME_BOOTSTRAP__ = {
      scopeKey: "user-bootstrap-id",
      theme: "nature",
    };
    const { container } = render(
      <UserThemeScope user={undefined}>
        <p>kid</p>
      </UserThemeScope>,
    );
    const wrapper = container.querySelector("[data-user-theme-scope]");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute("data-user-theme-scope")).toBe("user-bootstrap-id");
    expect(wrapper?.getAttribute("data-theme")).toBe("nature");
    // The SSR'd <style> in <head> is the source of truth before user
    // data arrives; we don't emit our own here.
    expect(container.querySelector("style[data-user-theme-scope-style]")).toBeNull();
  });

  it("rejects an unsafe SSR bootstrap (must match the safe scope-key shape)", () => {
    (window as unknown as { __USER_THEME_BOOTSTRAP__?: unknown }).__USER_THEME_BOOTSTRAP__ = {
      scopeKey: 'abc"]><script>x()</script>',
      theme: "nature",
    };
    const { container } = render(
      <UserThemeScope user={undefined}>
        <p>kid</p>
      </UserThemeScope>,
    );
    expect(container.querySelector("[data-user-theme-scope]")).toBeNull();
  });

  it("sanitizes the user id used in the scope key (never produces an unsafe selector)", () => {
    const { container } = render(
      <UserThemeScope
        user={buildUser({ id: 'abc"]><script>x()</script>', colorBackground: "0 0% 50%" })}
      >
        <p>kid</p>
      </UserThemeScope>,
    );
    const wrapper = container.querySelector("[data-user-theme-scope]");
    // The id had `<`, `>`, `"`, `]`, `(`, `)` stripped; only safe chars remain.
    expect(wrapper?.getAttribute("data-user-theme-scope")).toBe("user-abcscriptxscript");
    const style = container.querySelector("style[data-user-theme-scope-style]");
    expect(style?.textContent || "").not.toContain("<script>");
  });
});
