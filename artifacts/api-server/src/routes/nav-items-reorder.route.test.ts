import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { ResultSetHeader } from "mysql2/promise";

type FakeUser = { id: string; role: "owner" | "reader"; status: "active" } | null;
const userHolder: { current: FakeUser } = { current: null };

vi.mock("../lib/og", () => ({ generatePostOgImage: async () => Buffer.alloc(0) }));
vi.mock("../lib/current-user", () => ({
  loadCurrentUser: async () => ({
    session: userHolder.current ? { user: { id: userHolder.current.id } } : null,
    user: userHolder.current,
  }),
  loadAuthSession: async () =>
    userHolder.current ? { user: { id: userHolder.current.id } } : null,
}));

const { mysqlPool } = await import("@workspace/db");
const { default: navLinksRouter } = await import("./nav-links");

const RUN_ID = randomUUID().slice(0, 8);
const LABEL_PREFIX = `nav-rd-${RUN_ID}-`;
const OWNER: FakeUser = { id: `e2e-reorder-owner-${RUN_ID}`, role: "owner", status: "active" };

let server: Server;
let baseUrl: string;
const seededIds: number[] = [];

beforeAll(async () => {
  const app: Express = express();
  app.use(express.json());
  app.use("/api", navLinksRouter);
  await new Promise<void>((resolve) => {
    server = http.createServer(app).listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;
}, 30_000);

afterAll(async () => {
  if (seededIds.length > 0) {
    try {
      await mysqlPool.query(
        `DELETE FROM nav_links WHERE id IN (${seededIds.map(() => "?").join(",")})`,
        seededIds,
      );
    } catch {}
  }
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await mysqlPool.end().catch(() => undefined);
}, 30_000);

async function insertDirect(label: string, url: string, sortOrder: number): Promise<number> {
  const [r] = await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO nav_links (label, url, sort_order, kind, visible) VALUES (?, ?, ?, 'external', 1)`,
    [label, url, sortOrder],
  );
  seededIds.push(r.insertId);
  return r.insertId;
}

describe("PATCH /nav-items/reorder", () => {
  it("rejects anonymous and non-owner", async () => {
    userHolder.current = null;
    const r1 = await fetch(`${baseUrl}/api/nav-items/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [] }),
    });
    expect(r1.status).toBe(401);
    userHolder.current = { id: `reader-${RUN_ID}`, role: "reader", status: "active" };
    const r2 = await fetch(`${baseUrl}/api/nav-items/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [] }),
    });
    expect(r2.status).toBe(403);
  });

  it("requires every nav row in the payload and renumbers in increments of 10", async () => {
    userHolder.current = OWNER;
    const a = await insertDirect(`${LABEL_PREFIX}A`, "https://a.example", 1000);
    const b = await insertDirect(`${LABEL_PREFIX}B`, "https://b.example", 1010);
    const c = await insertDirect(`${LABEL_PREFIX}C`, "https://c.example", 1020);

    // Partial reorders are rejected — must include every nav row.
    const partial = await fetch(`${baseUrl}/api/nav-items/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [
          { id: a, sortOrder: 2 },
          { id: c, sortOrder: 1 },
          { id: b, sortOrder: 3 },
        ],
      }),
    });
    expect(partial.status).toBe(400);
    const partialBody = (await partial.json()) as { missingIds?: number[] };
    expect(Array.isArray(partialBody.missingIds)).toBe(true);

    // Full reorder including every row in the table — fetch full list, then
    // renumber. Use arbitrary positive numbers; server sorts. Retry the
    // fetch+submit cycle a few times to handle the race where a parallel
    // test file inserts a nav row between our list and our reorder.
    const ourOrder = [c, a, b];
    let body: { links: Array<{ id: number; label: string; sortOrder: number }> } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const listRes = await fetch(`${baseUrl}/api/nav-links?includeHidden=1`);
      const allLinks = ((await listRes.json()) as { links: Array<{ id: number }> }).links;
      const filtered = allLinks.filter((it) => !ourOrder.includes(it.id));
      const final = [
        ...ourOrder.map((id, i) => ({ id, sortOrder: i + 1 })),
        ...filtered.map((it, i) => ({ id: it.id, sortOrder: ourOrder.length + i + 1 })),
      ];
      const res = await fetch(`${baseUrl}/api/nav-items/reorder`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: final }),
      });
      if (res.status === 200) {
        body = (await res.json()) as {
          links: Array<{ id: number; label: string; sortOrder: number }>;
        };
        break;
      }
    }
    expect(body).not.toBeNull();
    const ours = body!.links.filter((l) => l.label.startsWith(LABEL_PREFIX));
    const map = new Map(ours.map((l) => [l.id, l.sortOrder]));
    expect(map.get(c)).toBe(10);
    expect(map.get(a)).toBe(20);
    expect(map.get(b)).toBe(30);
  });

  it("rejects unknown ids with 400", async () => {
    userHolder.current = OWNER;
    const res = await fetch(`${baseUrl}/api/nav-items/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items: [{ id: 99_999_999, sortOrder: 10 }],
      }),
    });
    expect(res.status).toBe(400);
  });
});
