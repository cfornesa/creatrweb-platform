import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";

const { mysqlPool } = await import("@workspace/db");
const { default: feedsCatalogRouter } = await import("./feeds-catalog");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app: Express = express();
  app.use("/api", feedsCatalogRouter);
  await new Promise<void>((resolve) => {
    server = http.createServer(app).listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;
}, 15_000);

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await mysqlPool.end().catch(() => undefined);
}, 15_000);

describe("feeds catalog", () => {
  it("returns Atom + JSON Feed + MF2 entries with absolute URLs and known mime types", async () => {
    const res = await fetch(`${baseUrl}/api/feeds`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      feeds: Array<{
        slug: string;
        title: string;
        description: string;
        url: string;
        mimeType: string;
      }>;
    };
    expect(Array.isArray(body.feeds)).toBe(true);
    const slugs = body.feeds.map((f) => f.slug).sort();
    expect(slugs).toEqual(["atom", "json", "mf2"]);
    for (const f of body.feeds) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.url.startsWith("/") || /^https?:\/\//.test(f.url)).toBe(true);
    }
    expect(body.feeds.find((f) => f.slug === "atom")!.mimeType).toMatch(/atom\+xml/);
    expect(body.feeds.find((f) => f.slug === "json")!.mimeType).toMatch(/feed\+json/);
  });
});
