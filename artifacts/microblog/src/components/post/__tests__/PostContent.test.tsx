import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostContent } from "../PostContent";

describe("PostContent", () => {
  it("renders plain content as text without executing tags", () => {
    const malicious = "Hello <script>window.__pwned = true;</script> world";
    const { container } = render(
      <PostContent content={malicious} contentFormat="plain" />,
    );
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
    expect(container.textContent).toContain("<script>");
    expect(container.querySelector("script")).toBeNull();
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it("renders html content through HTML injection", () => {
    const safeHtml = "<p>Hello <strong>world</strong></p>";
    const { container } = render(
      <PostContent content={safeHtml} contentFormat="html" />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("world");
  });

  it("preserves whitespace in plain content", () => {
    const { container } = render(
      <PostContent content={"line one\n\nline two"} contentFormat="plain" />,
    );
    expect(container.querySelector("p")?.className).toContain("whitespace-pre-wrap");
    expect(container.textContent).toContain("line one");
    expect(container.textContent).toContain("line two");
  });
});
