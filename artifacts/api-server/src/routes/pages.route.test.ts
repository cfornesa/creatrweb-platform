import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";

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
const { default: pagesRouter } = await import("./pages");
const { default: navLinksRouter } = await import("./nav-links");

const RUN_ID = randomUUID().slice(0, 8);
const SLUG_PREFIX = `t25-${RUN_ID}-`;
const TITLE_PREFIX = `Page ${RUN_ID} `;
const OWNER: FakeUser = { id: `e2e-pages-owner-${RUN_ID}`, role: "owner", status: "active" };

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // pages.author_user_id has an FK to users.id, so the fake owner the
  // current-user mock returns must correspond to a real users row.
  await mysqlPool.query(
    `INSERT IGNORE INTO users (id, name, email, role, status) VALUES (?, ?, ?, 'owner', 'active')`,
    [OWNER!.id, "Pages Test Owner", `${OWNER!.id}@example.test`],
  );
  const app: Express = express();
  app.use(express.json());
  app.use("/api", pagesRouter);
  app.use("/api", navLinksRouter);
  await new Promise<void>((resolve) => {
    server = http.createServer(app).listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;
}, 30_000);

afterAll(async () => {
  try {
    await mysqlPool.query(`DELETE FROM pages WHERE slug LIKE ?`, [`${SLUG_PREFIX}%`]);
    await mysqlPool.query(`DELETE FROM nav_links WHERE label LIKE ?`, [`${TITLE_PREFIX}%`]);
    await mysqlPool.query(`DELETE FROM users WHERE id = ?`, [OWNER!.id]);
  } catch {}
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await mysqlPool.end().catch(() => undefined);
}, 30_000);

describe("pages CRUD + nav row sync", () => {
  it("rejects anonymous create with 401 / non-owner with 403", async () => {
    userHolder.current = null;
    const r1 = await fetch(`${baseUrl}/api/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x", slug: `${SLUG_PREFIX}x`, content: "" }),
    });
    expect(r1.status).toBe(401);
    userHolder.current = { id: `reader-${RUN_ID}`, role: "reader", status: "active" };
    const r2 = await fetch(`${baseUrl}/api/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x", slug: `${SLUG_PREFIX}x`, content: "" }),
    });
    expect(r2.status).toBe(403);
  });

  it("rejects reserved slugs and invalid characters with 400", async () => {
    userHolder.current = OWNER;
    for (const slug of ["feeds", "admin", "categories", "search", "with spaces", "-leading", "trailing-"]) {
      const res = await fetch(`${baseUrl}/api/pages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "x", slug, content: "" }),
      });
      expect(res.status, `slug "${slug}" should be rejected`).toBe(400);
    }
  });

  it("publishes a page with showInNav=true → creates nav row, slug change rewrites navbar href, delete cascades", async () => {
    userHolder.current = OWNER;
    const slug1 = `${SLUG_PREFIX}about`;
    const slug2 = `${SLUG_PREFIX}colophon`;

    const create = await fetch(`${baseUrl}/api/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `${TITLE_PREFIX}About`,
        slug: slug1,
        content: "<p>Hello <script>alert(1)</script>world</p>",
        status: "published",
        showInNav: true,
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      id: number;
      slug: string;
      content: string;
      showInNav: boolean;
    };
    expect(created.slug).toBe(slug1);
    // sanitizer must have stripped the script tag
    expect(created.content).not.toContain("<script");
    expect(created.content).toContain("Hello");

    // Public read works for published page
    userHolder.current = null;
    const pub = await fetch(`${baseUrl}/api/pages/${slug1}`);
    expect(pub.status).toBe(200);

    // Nav-links list (public) must include a kind=page row whose pageSlug
    // resolves the new path
    const navList = await fetch(`${baseUrl}/api/nav-links`);
    const navBody = (await navList.json()) as {
      links: Array<{
        id: number;
        kind: "external" | "page" | "system";
        pageId: number | null;
        pageSlug: string | null;
        visible: boolean;
      }>;
    };
    const navRow = navBody.links.find((l) => l.kind === "page" && l.pageId === created.id);
    expect(navRow).toBeTruthy();
    expect(navRow!.pageSlug).toBe(slug1);

    // Slug change rewrites the resolved pageSlug without a nav update
    userHolder.current = OWNER;
    const upd = await fetch(`${baseUrl}/api/pages/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: slug2 }),
    });
    expect(upd.status).toBe(200);

    userHolder.current = null;
    const navList2 = await fetch(`${baseUrl}/api/nav-links`);
    const navBody2 = (await navList2.json()) as {
      links: Array<{ id: number; pageId: number | null; pageSlug: string | null }>;
    };
    const navRow2 = navBody2.links.find((l) => l.pageId === created.id);
    expect(navRow2!.pageSlug).toBe(slug2);
    expect(navRow2!.id).toBe(navRow!.id); // same row, no churn

    // Delete page cascades to nav row
    userHolder.current = OWNER;
    const del = await fetch(`${baseUrl}/api/pages/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);

    const navList3 = await fetch(`${baseUrl}/api/nav-links`);
    const navBody3 = (await navList3.json()) as {
      links: Array<{ id: number; pageId: number | null }>;
    };
    expect(navBody3.links.find((l) => l.pageId === created.id)).toBeUndefined();
  });

  it("draft pages 404 for non-owner; visible to owner via includeDrafts", async () => {
    userHolder.current = OWNER;
    const slug = `${SLUG_PREFIX}secret`;
    const res = await fetch(`${baseUrl}/api/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `${TITLE_PREFIX}Secret`,
        slug,
        content: "<p>shh</p>",
        status: "draft",
        showInNav: false,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number };

    userHolder.current = null;
    const pub = await fetch(`${baseUrl}/api/pages/${slug}`);
    expect(pub.status).toBe(404);
    const list = await fetch(`${baseUrl}/api/pages`);
    const listBody = (await list.json()) as { pages: Array<{ id: number }> };
    expect(listBody.pages.find((p) => p.id === body.id)).toBeUndefined();

    userHolder.current = OWNER;
    const ownList = await fetch(`${baseUrl}/api/pages?includeDrafts=1`);
    const ownBody = (await ownList.json()) as { pages: Array<{ id: number }> };
    expect(ownBody.pages.find((p) => p.id === body.id)).toBeTruthy();

    await fetch(`${baseUrl}/api/pages/${body.id}`, { method: "DELETE" });
  });

  it("page edit without showInNav preserves a nav-manager-hidden row; explicit showInNav=true restores visibility", async () => {
    userHolder.current = OWNER;
    const slug = `${SLUG_PREFIX}toggle`;
    const create = await fetch(`${baseUrl}/api/pages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `${TITLE_PREFIX}Toggle`,
        slug,
        content: "<p>v1</p>",
        status: "published",
        showInNav: true,
      }),
    });
    expect(create.status).toBe(201);
    const page = (await create.json()) as { id: number };

    // Find the auto-created nav row.
    const list1 = await fetch(`${baseUrl}/api/nav-links`);
    const body1 = (await list1.json()) as {
      links: Array<{ id: number; pageId: number | null; visible: boolean }>;
    };
    const navRow = body1.links.find((l) => l.pageId === page.id)!;
    expect(navRow.visible).toBe(true);

    // Hide it via the navigation manager (PATCH /nav-links/:id).
    const hide = await fetch(`${baseUrl}/api/nav-links/${navRow.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visible: false }),
    });
    expect(hide.status).toBe(200);

    // Edit page content/title without sending showInNav — must not
    // re-show the row.
    const edit1 = await fetch(`${baseUrl}/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "<p>v2</p>" }),
    });
    expect(edit1.status).toBe(200);
    const list2 = await fetch(`${baseUrl}/api/nav-links?includeHidden=1`);
    const body2 = (await list2.json()) as {
      links: Array<{ id: number; pageId: number | null; visible: boolean }>;
    };
    expect(body2.links.find((l) => l.pageId === page.id)!.visible).toBe(false);

    // Explicit showInNav=true on a published page restores visibility.
    const edit2 = await fetch(`${baseUrl}/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ showInNav: true }),
    });
    expect(edit2.status).toBe(200);
    const list3 = await fetch(`${baseUrl}/api/nav-links`);
    const body3 = (await list3.json()) as {
      links: Array<{ id: number; pageId: number | null; visible: boolean }>;
    };
    expect(body3.links.find((l) => l.pageId === page.id)!.visible).toBe(true);

    await fetch(`${baseUrl}/api/pages/${page.id}`, { method: "DELETE" });
  });
});
