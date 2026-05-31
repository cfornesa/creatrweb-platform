import { describe, expect, it } from "vitest";
import { buildImmersiveThreeEmbedHtml } from "./piece-embed-html.helpers";

describe("piece-embed-html route helpers", () => {
  it("delegates Three.js embeds to the full immersive renderer", () => {
    const origin = "https://example.com";
    const html = buildImmersiveThreeEmbedHtml("Three.js Enlightenment", 12, 34, origin);

    expect(html).toContain('https://example.com/immersive/pieces/12?embed=1&version=34');
    expect(html).not.toContain("static=1");
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"');
    expect(html).toContain("background: #050b16");
    expect(html).not.toContain("import * as THREE");
    expect(html).not.toContain("function autoFit()");
  });
});
