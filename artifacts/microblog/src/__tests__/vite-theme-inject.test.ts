import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runThemeInjection } from "../../vite.theme-inject";

/**
 * Unit coverage for the dev-only theme-injection plugin's pure
 * transform. The real plugin wires `injectThemeData` (from the
 * api-server) and `server.transformIndexHtml` (from vite) into this
 * function — here we drive it directly with stubs so the test never
 * needs a live vite dev server or a real db.
 */

function makeIndexHtml(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vite-theme-inject-"));
  const file = path.join(dir, "index.html");
  fs.writeFileSync(
    file,
    `<!DOCTYPE html><html><head><title>x</title></head><body><div id="root"></div></body></html>`,
    "utf-8",
  );
  return file;
}

describe("runThemeInjection", () => {
  it("returns the injected HTML through transformIndexHtml when injectThemeData succeeds", async () => {
    const indexPath = makeIndexHtml();
    const injectedFixture =
      `<!DOCTYPE html><html lang="en" data-theme="bauhaus">` +
      `<head><title>x</title>` +
      `<style id="site-settings-theme">:root { --background: 0 0% 100%; }</style>` +
      `</head><body><div id="root"></div></body></html>`;

    const injectThemeData = vi.fn(async () => injectedFixture);
    const transformIndexHtml = vi.fn(async (_url: string, html: string) =>
      html.replace(
        "</body>",
        `<script type="module" src="/@vite/client"></script></body>`,
      ),
    );

    const out = await runThemeInjection(indexPath, "/", {
      injectThemeData,
      transformIndexHtml,
    });

    expect(injectThemeData).toHaveBeenCalledWith(indexPath);
    expect(transformIndexHtml).toHaveBeenCalledWith("/", injectedFixture);
    expect(out).toContain('<style id="site-settings-theme">');
    expect(out).toContain('data-theme="bauhaus"');
    // Vite's HMR transform was given the chance to mutate the HTML.
    expect(out).toContain("/@vite/client");
  });

  it("falls back to the raw on-disk index.html (still through transformIndexHtml) when injectThemeData throws", async () => {
    const indexPath = makeIndexHtml();
    const raw = fs.readFileSync(indexPath, "utf-8");

    const injectThemeData = vi.fn(async () => {
      throw new Error("db down");
    });
    const transformIndexHtml = vi.fn(async (_url: string, html: string) => html);

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runThemeInjection(indexPath, "/", {
      injectThemeData,
      transformIndexHtml,
    });
    errSpy.mockRestore();

    expect(transformIndexHtml).toHaveBeenCalledWith("/", raw);
    expect(out).toBe(raw);
    // No injected markers — proves we did fall back to the on-disk html.
    expect(out).not.toContain("site-settings-theme");
  });
});
