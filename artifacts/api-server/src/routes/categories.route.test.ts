import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { ResultSetHeader } from "mysql2/promise";

/**
 * End-to-end coverage for the categories routes plus the bits of
 * `/api/posts/search` and `PATCH /api/posts/:id` that this task
 * touched. Tests scope themselves to a per-run sentinel so concurrent
 * runs don't collide and the cleanup only deletes rows we inserted.
 *
 * `current-user` is mocked through a mutable holder so tests can
 * toggle between an anonymous reader and an "owner" caller; `og`
 * loads font files at module init and is not reachable from these
 * routes, so it gets a no-op stub.
 */

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
const { default: categoriesRouter } = await import("./categories");
const { default: postsRouter } = await import("./posts");
const { default: pendingPostsRouter } = await import("./pending-posts");

const RUN_ID = randomUUID();
const SENTINEL_AUTHOR = `e2e-cat-${RUN_ID}`;
const OWNER_ID = `e2e-cat-owner-${RUN_ID}`;
const OWNER: FakeUser = { id: OWNER_ID, role: "owner", status: "active" };

let server: Server;
let baseUrl: string;
const seededCategoryIds: number[] = [];
const seededPostIds: number[] = [];

async function insertCategory(name: string, slug: string): Promise<number> {
  const [r] = await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO categories (slug, name, description) VALUES (?, ?, ?)`,
    [slug, name, null],
  );
  seededCategoryIds.push(r.insertId);
  return r.insertId;
}

async function insertPost(
  contentText: string,
  status: "published" | "pending" = "published",
): Promise<number> {
  // author_user_id stays NULL — the FK to users(id) means we'd
  // otherwise need to seed an owner user row in the db, and the
  // PATCH/owner check happily allows NULL ownership through.
  const [r] = await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO posts
       (author_id, author_name, content, content_text,
        content_format, status, created_at)
     VALUES (?, ?, ?, ?, 'plain', ?, NOW())`,
    [SENTINEL_AUTHOR, SENTINEL_AUTHOR, contentText, contentText, status],
  );
  seededPostIds.push(r.insertId);
  return r.insertId;
}

async function linkPostCategory(postId: number, categoryId: number) {
  await mysqlPool.query(
    `INSERT INTO post_categories (post_id, category_id) VALUES (?, ?)`,
    [postId, categoryId],
  );
}

beforeAll(async () => {
  const app: Express = express();
  app.use(express.json());
  // Mount pending-posts BEFORE the generic posts router so the
  // `/posts/pending` literal isn't swallowed by `/posts/:id` — same
  // ordering the production composition in routes/index.ts uses.
  app.use("/api", pendingPostsRouter);
  app.use("/api", categoriesRouter);
  app.use("/api", postsRouter);
  await new Promise<void>((resolve) => {
    server = http.createServer(app).listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;
}, 30_000);

afterAll(async () => {
  try {
    await mysqlPool.query(`DELETE FROM posts WHERE author_id = ?`, [SENTINEL_AUTHOR]);
  } catch {}
  if (seededCategoryIds.length > 0) {
    try {
      await mysqlPool.query(
        `DELETE FROM categories WHERE id IN (${seededCategoryIds.map(() => "?").join(",")})`,
        seededCategoryIds,
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

describe("categories owner-gating", () => {
  it("rejects anonymous PATCH/DELETE with 401", async () => {
    userHolder.current = null;
    const id = await insertCategory(`Cat A ${RUN_ID}`, `cat-a-${RUN_ID}`);
    const patch = await fetch(`${baseUrl}/api/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(patch.status).toBe(401);
    const del = await fetch(`${baseUrl}/api/categories/${id}`, { method: "DELETE" });
    expect(del.status).toBe(401);
  });

  it("rejects non-owner PATCH/DELETE with 403", async () => {
    userHolder.current = { id: `reader-${RUN_ID}`, role: "reader", status: "active" };
    const id = await insertCategory(`Cat B ${RUN_ID}`, `cat-b-${RUN_ID}`);
    const patch = await fetch(`${baseUrl}/api/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(patch.status).toBe(403);
    const del = await fetch(`${baseUrl}/api/categories/${id}`, { method: "DELETE" });
    expect(del.status).toBe(403);
  });

  it("returns 404 for non-numeric id and unknown id", async () => {
    userHolder.current = OWNER;
    const bogus = await fetch(`${baseUrl}/api/categories/not-a-number`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(bogus.status).toBe(404);
    const missing = await fetch(`${baseUrl}/api/categories/99999999`, {
      method: "DELETE",
    });
    expect(missing.status).toBe(404);
  });

  it("owner can update name + description and delete by id", async () => {
    userHolder.current = OWNER;
    const id = await insertCategory(`Cat C ${RUN_ID}`, `cat-c-${RUN_ID}`);
    const patch = await fetch(`${baseUrl}/api/categories/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: `Cat C2 ${RUN_ID}`, description: "hello" }),
    });
    expect(patch.status).toBe(200);
    const updated = (await patch.json()) as {
      id: number;
      name: string;
      description: string | null;
    };
    expect(updated.id).toBe(id);
    expect(updated.name).toBe(`Cat C2 ${RUN_ID}`);
    expect(updated.description).toBe("hello");

    const del = await fetch(`${baseUrl}/api/categories/${id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    seededCategoryIds.splice(seededCategoryIds.indexOf(id), 1);
  });
});

describe("GET /categories/:slug/posts includePending", () => {
  it("hides pending posts from anonymous readers and shows them to owners with includePending=1", async () => {
    userHolder.current = OWNER;
    const slug = `cat-pending-${RUN_ID}`;
    const catId = await insertCategory(`Pending ${RUN_ID}`, slug);
    const publishedId = await insertPost(`pub ${RUN_ID}`, "published");
    const pendingId = await insertPost(`pend ${RUN_ID}`, "pending");
    await linkPostCategory(publishedId, catId);
    await linkPostCategory(pendingId, catId);

    userHolder.current = null;
    const anon = await fetch(`${baseUrl}/api/categories/${slug}/posts`);
    expect(anon.status).toBe(200);
    const anonBody = (await anon.json()) as { posts: Array<{ id: number }>; total: number };
    expect(anonBody.posts.map((p) => p.id)).toEqual([publishedId]);
    expect(anonBody.total).toBe(1);

    // Anonymous caller cannot escalate via the query string.
    const anonForce = await fetch(
      `${baseUrl}/api/categories/${slug}/posts?includePending=1`,
    );
    const anonForceBody = (await anonForce.json()) as {
      posts: Array<{ id: number }>;
    };
    expect(anonForceBody.posts.map((p) => p.id)).toEqual([publishedId]);

    userHolder.current = OWNER;
    const owner = await fetch(
      `${baseUrl}/api/categories/${slug}/posts?includePending=1`,
    );
    expect(owner.status).toBe(200);
    const ownerBody = (await owner.json()) as { posts: Array<{ id: number }>; total: number };
    expect(ownerBody.posts.map((p) => p.id).sort()).toEqual(
      [publishedId, pendingId].sort(),
    );
    expect(ownerBody.total).toBe(2);
  });
});

describe("POST /categories create + slug collision + delete cascade", () => {
  it("auto-slugifies, derives collision suffixes, and cascades the join rows on delete", async () => {
    userHolder.current = OWNER;

    // First create — slug derived from name.
    const baseName = `Slug Coll ${RUN_ID}`;
    const a = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: baseName }),
    });
    expect(a.status).toBe(201);
    const aBody = (await a.json()) as { id: number; slug: string; name: string };
    seededCategoryIds.push(aBody.id);
    // The slug is derived from the name (lowercased, dashed).
    expect(aBody.slug).toBe(`slug-coll-${RUN_ID}`);

    // Second create with the same name — must produce a non-colliding slug.
    const b = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: baseName }),
    });
    expect(b.status).toBe(201);
    const bBody = (await b.json()) as { id: number; slug: string };
    seededCategoryIds.push(bBody.id);
    expect(bBody.slug).not.toBe(aBody.slug);
    expect(bBody.slug.startsWith(aBody.slug)).toBe(true);

    // Cascade: link a post to category B, then delete the category and
    // verify post_categories was cleaned up by the FK ON DELETE CASCADE.
    const postId = await insertPost(`cascade ${RUN_ID}`, "published");
    await linkPostCategory(postId, bBody.id);
    const beforeDelete = await mysqlPool.query(
      `SELECT COUNT(*) AS n FROM post_categories WHERE category_id = ?`,
      [bBody.id],
    );
    expect((beforeDelete[0] as Array<{ n: number }>)[0].n).toBe(1);

    const del = await fetch(`${baseUrl}/api/categories/${bBody.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    seededCategoryIds.splice(seededCategoryIds.indexOf(bBody.id), 1);

    const afterDelete = await mysqlPool.query(
      `SELECT COUNT(*) AS n FROM post_categories WHERE category_id = ?`,
      [bBody.id],
    );
    expect((afterDelete[0] as Array<{ n: number }>)[0].n).toBe(0);
    // The post itself survives — only the join row is dropped.
    const postSurvives = await mysqlPool.query(
      `SELECT id FROM posts WHERE id = ?`,
      [postId],
    );
    expect((postSurvives[0] as Array<{ id: number }>).length).toBe(1);
  });
});

describe("POST /posts persists categoryIds and rejects malformed/unknown ids", () => {
  it("creates a post with valid category ids, hydrates them in the response, and rejects malformed ids without writing a row", async () => {
    userHolder.current = {
      id: OWNER_ID,
      role: "owner",
      status: "active",
    } as FakeUser;

    const cat = await insertCategory(
      `Persist ${RUN_ID}`,
      `cat-persist-${RUN_ID}`,
    );

    // FK on author_user_id needs an actual users row when we go
    // through the route (the test inserts above bypassed it). Seed one.
    await mysqlPool.query(
      `INSERT INTO users (id, name, email) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [OWNER_ID, "Test Owner", `${OWNER_ID}@example.test`],
    );

    const ok = await fetch(`${baseUrl}/api/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: `with-cat ${RUN_ID}`,
        contentFormat: "plain",
        categoryIds: [cat],
      }),
    });
    expect(ok.status).toBe(201);
    const okBody = (await ok.json()) as {
      id: number;
      categories: Array<{ id: number; slug: string }>;
    };
    seededPostIds.push(okBody.id);
    expect(okBody.categories.map((c) => c.id)).toEqual([cat]);

    // Malformed (non-positive) id — must 400 and leave no new row.
    const before = await mysqlPool.query(
      `SELECT COUNT(*) AS n FROM posts WHERE author_user_id = ? AND content = ?`,
      [OWNER_ID, `bad ${RUN_ID}`],
    );
    expect((before[0] as Array<{ n: number }>)[0].n).toBe(0);

    const bad = await fetch(`${baseUrl}/api/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: `bad ${RUN_ID}`,
        contentFormat: "plain",
        categoryIds: [-1],
      }),
    });
    expect(bad.status).toBe(400);

    const after = await mysqlPool.query(
      `SELECT COUNT(*) AS n FROM posts WHERE author_user_id = ? AND content = ?`,
      [OWNER_ID, `bad ${RUN_ID}`],
    );
    expect((after[0] as Array<{ n: number }>)[0].n).toBe(0);

    // Cleanup the seeded user.
    await mysqlPool.query(`DELETE FROM users WHERE id = ?`, [OWNER_ID]);
  });
});

describe("PATCH /posts/:id transactional category validation", () => {
  it("returns 400 with unknownIds and leaves post content unchanged", async () => {
    userHolder.current = OWNER;
    const postId = await insertPost(`original ${RUN_ID}`, "published");
    const res = await fetch(`${baseUrl}/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: `mutated ${RUN_ID}`,
        contentFormat: "plain",
        categoryIds: [987654321],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; unknownIds?: number[] };
    expect(body.unknownIds).toEqual([987654321]);

    // Re-read straight from MySQL to confirm content didn't change.
    const [rows] = await mysqlPool.query<
      Array<{ content: string }> & import("mysql2").RowDataPacket[]
    >(`SELECT content FROM posts WHERE id = ?`, [postId]);
    expect(rows[0]?.content).toBe(`original ${RUN_ID}`);
  });
});

describe("categories[] hydration on list / detail / pending endpoints", () => {
  it("GET /posts hydrates categories[] for the listed post", async () => {
    userHolder.current = OWNER;
    const slug = `hydrate-list-${RUN_ID}`;
    const catId = await insertCategory(`HList ${RUN_ID}`, slug);
    const postId = await insertPost(`hydratelist ${RUN_ID}`, "published");
    await linkPostCategory(postId, catId);

    userHolder.current = null;
    // Page through until we find our seeded post — production rows
    // can push it past page 1, so we walk pages instead of asserting
    // an exact total.
    let found:
      | { id: number; categories: Array<{ id: number; slug: string }> }
      | undefined;
    for (let page = 1; page <= 20 && !found; page += 1) {
      const res = await fetch(`${baseUrl}/api/posts?page=${page}&limit=100`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        posts: Array<{ id: number; categories: Array<{ id: number; slug: string }> }>;
      };
      found = body.posts.find((p) => p.id === postId);
      if (body.posts.length < 100) break;
    }
    expect(found).toBeDefined();
    expect(found!.categories.map((c) => c.slug)).toEqual([slug]);
    expect(found!.categories[0]!.id).toBe(catId);
  });

  it("GET /posts/:id hydrates categories[] for the single post", async () => {
    userHolder.current = OWNER;
    const slug = `hydrate-detail-${RUN_ID}`;
    const catId = await insertCategory(`HDetail ${RUN_ID}`, slug);
    const postId = await insertPost(`hydratedetail ${RUN_ID}`, "published");
    await linkPostCategory(postId, catId);

    userHolder.current = null;
    const res = await fetch(`${baseUrl}/api/posts/${postId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      post: { id: number; categories: Array<{ id: number; slug: string }> };
    };
    expect(body.post.id).toBe(postId);
    expect(body.post.categories.map((c) => c.slug)).toEqual([slug]);
    expect(body.post.categories[0]!.id).toBe(catId);
  });

  it("GET /posts/pending hydrates categories[] for owner-only moderation queue", async () => {
    userHolder.current = OWNER;
    const slug = `hydrate-pending-${RUN_ID}`;
    const catId = await insertCategory(`HPending ${RUN_ID}`, slug);
    const postId = await insertPost(`hydratepending ${RUN_ID}`, "pending");
    await linkPostCategory(postId, catId);

    // Anonymous callers cannot reach the queue at all.
    userHolder.current = null;
    const denied = await fetch(`${baseUrl}/api/posts/pending`);
    expect(denied.status).toBe(401);

    // Owner: walk pages until our seeded pending row appears.
    userHolder.current = OWNER;
    let found:
      | { id: number; categories: Array<{ id: number; slug: string }> }
      | undefined;
    for (let page = 1; page <= 20 && !found; page += 1) {
      const res = await fetch(
        `${baseUrl}/api/posts/pending?page=${page}&limit=200`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        posts: Array<{ id: number; categories: Array<{ id: number; slug: string }> }>;
      };
      found = body.posts.find((p) => p.id === postId);
      if (body.posts.length < 200) break;
    }
    expect(found).toBeDefined();
    expect(found!.categories.map((c) => c.slug)).toEqual([slug]);
    expect(found!.categories[0]!.id).toBe(catId);
  });
});

describe("GET /posts/search categories filter", () => {
  it("filters by category slug (OR semantics) and hydrates categories[]", async () => {
    userHolder.current = OWNER;
    const slugX = `search-x-${RUN_ID}`;
    const slugY = `search-y-${RUN_ID}`;
    const catX = await insertCategory(`SX ${RUN_ID}`, slugX);
    const catY = await insertCategory(`SY ${RUN_ID}`, slugY);
    const inX = await insertPost(`searchcat post in x ${RUN_ID}`, "published");
    const inY = await insertPost(`searchcat post in y ${RUN_ID}`, "published");
    const inNeither = await insertPost(`searchcat lonely ${RUN_ID}`, "published");
    void inNeither;
    await linkPostCategory(inX, catX);
    await linkPostCategory(inY, catY);

    const res = await fetch(
      `${baseUrl}/api/posts/search?author=${encodeURIComponent(SENTINEL_AUTHOR)}&categories=${slugX},${slugY}&limit=50`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      posts: Array<{ id: number; categories: Array<{ slug: string }> }>;
    };
    const ids = body.posts.map((p) => p.id).sort();
    expect(ids).toEqual([inX, inY].sort());
    const xPost = body.posts.find((p) => p.id === inX)!;
    expect(xPost.categories.map((c) => c.slug)).toEqual([slugX]);
  });
});
