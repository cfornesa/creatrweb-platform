import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

const { mysqlPool } = await import("@workspace/db");
const { default: feedsRouter } = await import("./feeds");

let server: Server;
let baseUrl: string;
const RUN_ID = randomUUID();
const SENTINEL_AUTHOR = `e2e-feeds-${RUN_ID}`;
const SLUG_A = `e2e-feeds-a-${RUN_ID.slice(0, 8)}`;
const SLUG_B = `e2e-feeds-b-${RUN_ID.slice(0, 8)}`;
let postWithCatsId = 0;
let postNoCatsId = 0;
let categoryIdA = 0;
let categoryIdB = 0;

async function insertPost(content: string): Promise<number> {
  const [r] = await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO posts (author_id, author_name, content, content_text,
                        content_format, status, created_at)
     VALUES (?, ?, ?, ?, 'plain', 'published', NOW())`,
    [SENTINEL_AUTHOR, SENTINEL_AUTHOR, content, content],
  );
  return r.insertId;
}

beforeAll(async () => {
  const app: Express = express();
  app.use(feedsRouter);
  await new Promise<void>((resolve) => {
    server = http.createServer(app).listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;

  const [resA] = await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO categories (slug, name) VALUES (?, ?)`,
    [SLUG_A, "Feeds Alpha"],
  );
  categoryIdA = resA.insertId;
  const [resB] = await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO categories (slug, name) VALUES (?, ?)`,
    [SLUG_B, "Feeds Beta"],
  );
  categoryIdB = resB.insertId;

  postWithCatsId = await insertPost("feeds-categories-test body with categories");
  postNoCatsId = await insertPost("feeds-categories-test body no categories");

  await mysqlPool.query(
    `INSERT INTO post_categories (post_id, category_id) VALUES (?, ?), (?, ?)`,
    [postWithCatsId, categoryIdA, postWithCatsId, categoryIdB],
  );
}, 30_000);

afterAll(async () => {
  // Clean up everything we inserted, scoped by the sentinel author
  // and our two known category ids.
  await mysqlPool.query(
    `DELETE pc FROM post_categories pc
       JOIN posts p ON p.id = pc.post_id
      WHERE p.author_name = ?`,
    [SENTINEL_AUTHOR],
  );
  await mysqlPool.query(`DELETE FROM posts WHERE author_name = ?`, [SENTINEL_AUTHOR]);
  await mysqlPool.query(`DELETE FROM categories WHERE id IN (?, ?)`, [
    categoryIdA,
    categoryIdB,
  ]);
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  await mysqlPool.end().catch(() => undefined);
}, 15_000);

describe("public feeds — categories", () => {
  function findAtomEntry(xml: string, postId: number): string {
    // Split on </entry> first so the per-entry chunks never cross
    // boundaries (a non-greedy regex spanning `<entry>…</entry>`
    // happily skips into the *next* entry when the target post id
    // sits in a later entry that doesn't carry the substring earlier
    // entries do).
    const chunks = xml.split("</entry>");
    return chunks.find((c) => c.includes(`/posts/${postId}`)) ?? "";
  }

  it("Atom /feed.xml emits <category term=slug label=name> per post category", async () => {
    const res = await fetch(`${baseUrl}/feed.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/atom\+xml/);
    const xml = await res.text();
    const entry = findAtomEntry(xml, postWithCatsId);
    expect(entry).toMatch(
      new RegExp(`<category term="${SLUG_A}" label="Feeds Alpha" />`),
    );
    expect(entry).toMatch(
      new RegExp(`<category term="${SLUG_B}" label="Feeds Beta" />`),
    );
  });

  it("JSON Feed /feed.json sets tags=[name,...] on each item", async () => {
    const res = await fetch(`${baseUrl}/feed.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/feed\+json/);
    const body = (await res.json()) as {
      items: Array<{ id: string; tags?: string[] }>;
    };
    const ours = body.items.find((i) => i.id.endsWith(`/posts/${postWithCatsId}`));
    expect(ours).toBeDefined();
    expect(ours!.tags).toBeDefined();
    expect(new Set(ours!.tags)).toEqual(new Set(["Feeds Alpha", "Feeds Beta"]));
  });

  it("MF2 /export.json sets properties.category=[name,...] on each h-entry", async () => {
    const res = await fetch(`${baseUrl}/export.json`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        properties: { url: string[]; category?: string[] };
      }>;
    };
    const ours = body.items.find((i) =>
      i.properties.url[0]!.endsWith(`/posts/${postWithCatsId}`),
    );
    expect(ours).toBeDefined();
    expect(ours!.properties.category).toBeDefined();
    expect(new Set(ours!.properties.category)).toEqual(
      new Set(["Feeds Alpha", "Feeds Beta"]),
    );
  });

  it("posts with no categories omit the field in every feed surface", async () => {
    const xml = await (await fetch(`${baseUrl}/feed.xml`)).text();
    const json = (await (await fetch(`${baseUrl}/feed.json`)).json()) as {
      items: Array<{ id: string; tags?: string[] }>;
    };
    const mf2 = (await (await fetch(`${baseUrl}/export.json`)).json()) as {
      items: Array<{ properties: { url: string[]; category?: string[] } }>;
    };

    const jsonItem = json.items.find((i) => i.id.endsWith(`/posts/${postNoCatsId}`));
    const mf2Item = mf2.items.find((i) =>
      i.properties.url[0]!.endsWith(`/posts/${postNoCatsId}`),
    );
    expect(jsonItem).toBeDefined();
    expect(jsonItem!.tags).toBeUndefined();
    expect(mf2Item).toBeDefined();
    expect(mf2Item!.properties.category).toBeUndefined();

    const entry = findAtomEntry(xml, postNoCatsId);
    expect(entry).not.toBe("");
    expect(entry).not.toMatch(/<category /);
  });
});

// Eliminates unused-type warnings if the file is type-checked in
// isolation (RowDataPacket is only consumed via mysql2 types).
type _MaybeUnused = RowDataPacket;
