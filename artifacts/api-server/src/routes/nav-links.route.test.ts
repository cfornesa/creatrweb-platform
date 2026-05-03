import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { ResultSetHeader } from "mysql2/promise";

type FakeUser = { id: string; role: "owner" | "reader"; status: "active" } | null;

const userHolder: { current: FakeUser } = { current: null };

vi.mock("../lib/og", () => ({
  generatePostOgImage: async () => Buffer.alloc(0),
}));

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

const RUN_ID = randomUUID();
const OWNER_ID = `e2e-nav-owner-${RUN_ID}`;
const OWNER: FakeUser = { id: OWNER_ID, role: "owner", status: "active" };
const LABEL_PREFIX = `nav-${RUN_ID}-`;

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
  try {
    await mysqlPool.query(`DELETE FROM nav_links WHERE label LIKE ?`, [`${LABEL_PREFIX}%`]);
  } catch {}
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await mysqlPool.end().catch(() => undefined);
}, 30_000);

async function insertDirect(label: string, url: string, sortOrder: number): Promise<number> {
  const [r] = await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO nav_links (label, url, sort_order) VALUES (?, ?, ?)`,
    [label, url, sortOrder],
  );
  seededIds.push(r.insertId);
  return r.insertId;
}

describe("nav-links auth gating", () => {
  it("rejects anonymous POST/PATCH/DELETE with 401", async () => {
    userHolder.current = null;
    const id = await insertDirect(`${LABEL_PREFIX}A`, "https://a.example", 0);
    const post = await fetch(`${baseUrl}/api/nav-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "x", url: "https://x.example" }),
    });
    expect(post.status).toBe(401);
    const patch = await fetch(`${baseUrl}/api/nav-links/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "x" }),
    });
    expect(patch.status).toBe(401);
    const del = await fetch(`${baseUrl}/api/nav-links/${id}`, { method: "DELETE" });
    expect(del.status).toBe(401);
  });

  it("rejects non-owner with 403", async () => {
    userHolder.current = { id: `reader-${RUN_ID}`, role: "reader", status: "active" };
    const id = await insertDirect(`${LABEL_PREFIX}B`, "https://b.example", 0);
    const post = await fetch(`${baseUrl}/api/nav-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "x", url: "https://x.example" }),
    });
    expect(post.status).toBe(403);
    const patch = await fetch(`${baseUrl}/api/nav-links/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "x" }),
    });
    expect(patch.status).toBe(403);
    const del = await fetch(`${baseUrl}/api/nav-links/${id}`, { method: "DELETE" });
    expect(del.status).toBe(403);
  });
});

describe("nav-links CRUD + ordering", () => {
  it("owner can create, list (sorted by sort_order asc), update, and delete", async () => {
    userHolder.current = OWNER;

    const second = await insertDirect(`${LABEL_PREFIX}second`, "https://2.example", 20);
    const first = await insertDirect(`${LABEL_PREFIX}first`, "https://1.example", 10);

    userHolder.current = null;
    const list = await fetch(`${baseUrl}/api/nav-links`);
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      links: Array<{ id: number; label: string; sortOrder: number; openInNewTab: boolean }>;
    };
    const ours = listBody.links.filter((l) => l.label.startsWith(LABEL_PREFIX));
    const ids = ours.map((l) => l.id);
    expect(ids.indexOf(first)).toBeLessThan(ids.indexOf(second));
    expect(ours.find((l) => l.id === first)?.openInNewTab).toBe(true);

    userHolder.current = OWNER;
    const created = await fetch(`${baseUrl}/api/nav-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: `${LABEL_PREFIX}created`,
        url: "https://created.example",
        sortOrder: 5,
        openInNewTab: false,
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      id: number;
      label: string;
      sortOrder: number;
      openInNewTab: boolean;
    };
    seededIds.push(createdBody.id);
    expect(createdBody.openInNewTab).toBe(false);
    expect(createdBody.sortOrder).toBe(5);

    const patched = await fetch(`${baseUrl}/api/nav-links/${createdBody.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: 99 }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as {
      id: number;
      label: string;
      sortOrder: number;
      openInNewTab: boolean;
    };
    expect(patchedBody.sortOrder).toBe(99);
    expect(patchedBody.openInNewTab).toBe(false);
    expect(patchedBody.label).toBe(`${LABEL_PREFIX}created`);

    const bad = await fetch(`${baseUrl}/api/nav-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "   ", url: "https://bad.example" }),
    });
    expect(bad.status).toBe(400);

    const del = await fetch(`${baseUrl}/api/nav-links/${createdBody.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    seededIds.splice(seededIds.indexOf(createdBody.id), 1);

    const missing = await fetch(`${baseUrl}/api/nav-links/${createdBody.id}`, {
      method: "DELETE",
    });
    expect(missing.status).toBe(404);
  });

  it("seeds the system Categories nav row, refuses delete, and lets the owner toggle visible", async () => {
    // The migration seeds a `kind='system'` row at `/categories`
    // alongside the existing `/feeds` row. We don't assume which
    // numeric id it has — we look it up by the (kind, url) tuple
    // the seed inserts on.
    userHolder.current = null;
    const list = await fetch(`${baseUrl}/api/nav-links?includeHidden=1`);
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      links: Array<{
        id: number;
        url: string;
        kind: string;
        label: string;
        visible: boolean;
      }>;
    };
    const categoriesRow = body.links.find(
      (l) => l.kind === "system" && l.url === "/categories",
    );
    expect(categoriesRow, "Categories system nav row should be seeded").toBeTruthy();
    expect(categoriesRow!.label).toBe("Categories");

    // System rows can never be deleted (only hidden via visible=false).
    userHolder.current = OWNER;
    const del = await fetch(`${baseUrl}/api/nav-links/${categoriesRow!.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(400);

    // The visibility toggle must persist round-trip.
    const hide = await fetch(`${baseUrl}/api/nav-links/${categoriesRow!.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible: false }),
    });
    expect(hide.status).toBe(200);
    expect(((await hide.json()) as { visible: boolean }).visible).toBe(false);

    const restore = await fetch(`${baseUrl}/api/nav-links/${categoriesRow!.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible: true }),
    });
    expect(restore.status).toBe(200);
    expect(((await restore.json()) as { visible: boolean }).visible).toBe(true);
  });

  it("rejects unsafe URL schemes (javascript:, data:, file:) with 400", async () => {
    userHolder.current = OWNER;
    for (const url of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>",
      "file:///etc/passwd",
      "/relative-only",
      "not a url",
    ]) {
      const res = await fetch(`${baseUrl}/api/nav-links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: `${LABEL_PREFIX}xss`, url }),
      });
      expect(res.status, `URL "${url}" should be rejected`).toBe(400);
    }

    for (const url of ["mailto:hi@example.com", "tel:+15551234567", "http://x.example", "https://x.example"]) {
      const res = await fetch(`${baseUrl}/api/nav-links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: `${LABEL_PREFIX}ok`, url }),
      });
      expect(res.status, `URL "${url}" should be accepted`).toBe(201);
      const body = (await res.json()) as { id: number };
      seededIds.push(body.id);
    }
  });
});
