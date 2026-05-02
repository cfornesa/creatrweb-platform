import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

/**
 * End-to-end coverage for `GET /api/posts/search`.
 *
 * The unit tests in `post-search.test.ts` already lock down the parser
 * shape; this file is the only place that exercises the wired-up path
 * — Express handler → real `mysqlPool` → MySQL FULLTEXT/LIKE → JSON
 * response — against the same database the running app uses. Every
 * test scopes itself to a per-run sentinel `author_name` so the
 * assertions never depend on (or contaminate) production data, and a
 * single `afterAll` cleanup deletes everything we inserted.
 *
 * Two narrow modules are stubbed out: `og` (reads font files at module
 * load relative to the bundled `dist/` layout) and `current-user`
 * (instantiates the Auth.js Drizzle adapter at module load). Neither
 * is reachable from `/posts/search`, but both run during the import of
 * `posts.ts` and would otherwise fail before the test body starts.
 */

vi.mock("../lib/og", () => ({
  generatePostOgImage: async () => Buffer.alloc(0),
}));

vi.mock("../lib/current-user", () => ({
  loadCurrentUser: async () => ({ session: null, user: null }),
  loadAuthSession: async () => null,
}));

const { mysqlPool } = await import("@workspace/db");
const { default: postsRouter } = await import("./posts");

// Per-run sentinel so concurrent / repeated runs don't collide and so
// the cleanup in afterAll only touches rows this run inserted.
const RUN_ID = randomUUID();
const SENTINEL_AUTHOR = `e2e-search-${RUN_ID}`;
const SENTINEL_FEED_NAME = `e2e-search-feed-${RUN_ID}`;

// Distinctive search tokens. These need to NOT appear anywhere in
// production content, otherwise the assertions stop being deterministic.
// `9z` is 2 chars (under the FULLTEXT minimum) so it forces the
// LIKE-only branch; `qxnebula9` is 9 chars so it forces the FULLTEXT
// branch.
const SHORT_TOKEN = "9z";
const FULLTEXT_TOKEN = "qxnebula9";

let server: Server;
let baseUrl: string;
let testFeedId: number;
const ids: Record<string, number> = {};

type SeedRow = {
  key: string;
  contentText: string;
  contentFormat?: "plain" | "html";
  createdAt: string;
  sourceFeedId?: number | null;
};

async function insertPost(row: SeedRow): Promise<number> {
  const [r] = await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO posts
       (author_id, author_name, content, content_text, content_format,
        status, created_at, source_feed_id)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      SENTINEL_AUTHOR,
      SENTINEL_AUTHOR,
      row.contentText,
      row.contentText,
      row.contentFormat ?? "plain",
      "published",
      row.createdAt,
      row.sourceFeedId ?? null,
    ],
  );
  return r.insertId;
}

beforeAll(async () => {
  // Stand up a feed_source so the `sources=<id>` filter has a real
  // FK target to point at. The dummy feedUrl is unique per run so
  // we don't collide with the unique index on `feeds.feed_url`.
  const [feedRes] = await mysqlPool.query<ResultSetHeader>(
    `INSERT INTO feed_sources (name, feed_url, cadence, enabled)
     VALUES (?, ?, 'daily', 1)`,
    [SENTINEL_FEED_NAME, `https://example.invalid/${RUN_ID}.xml`],
  );
  testFeedId = feedRes.insertId;

  // Seed nine posts. The createdAt values are deliberately spread one
  // day apart so `from`/`to` filters can pick out a single row, and
  // so the recency tie-breaker has a stable order.
  const seeds: SeedRow[] = [
    { key: "P1", contentText: "alpha 9z opening note",                createdAt: "2024-01-01 12:00:00" },
    { key: "P2", contentText: "9z bravo middle",                       createdAt: "2024-01-02 12:00:00" },
    { key: "P3", contentText: "9z charlie newest plain",               createdAt: "2024-01-03 12:00:00" },
    { key: "P4", contentText: "html-only zq nobita",                   createdAt: "2024-01-04 12:00:00", contentFormat: "html" },
    { key: "P5", contentText: `${FULLTEXT_TOKEN} alone partial`,       createdAt: "2024-01-05 12:00:00" },
    { key: "P6", contentText: `${FULLTEXT_TOKEN} also partial here`,   createdAt: "2024-01-06 12:00:00" },
    // P7 is the "all-of-terms" row: it matches both the LIKE branch
    // (`%9z%`) and the FULLTEXT branch, with deliberately high term
    // frequency on the FULLTEXT token so its boolean-mode score
    // outranks the single-occurrence partial matches in P5/P6.
    { key: "P7", contentText: `9z ${FULLTEXT_TOKEN} ${FULLTEXT_TOKEN} ${FULLTEXT_TOKEN} ${FULLTEXT_TOKEN} ${FULLTEXT_TOKEN} all-terms`, createdAt: "2024-01-07 12:00:00" },
    { key: "P8", contentText: "completely unrelated",                  createdAt: "2024-01-08 12:00:00" },
    { key: "P9", contentText: "9z source-tagged",                      createdAt: "2024-01-09 12:00:00", sourceFeedId: testFeedId },
  ];
  for (const s of seeds) {
    ids[s.key] = await insertPost(s);
  }

  const app: Express = express();
  app.use("/api", postsRouter);
  await new Promise<void>((resolve) => {
    server = http.createServer(app).listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;
}, 30_000);

afterAll(async () => {
  // Best-effort cleanup. The sentinel scoping makes this safe to run
  // even if the seed inserts partially failed.
  try {
    await mysqlPool.query<RowDataPacket[]>(
      `DELETE FROM posts WHERE author_id = ?`,
      [SENTINEL_AUTHOR],
    );
  } catch {
    // ignore
  }
  try {
    await mysqlPool.query<RowDataPacket[]>(
      `DELETE FROM feed_sources WHERE name = ?`,
      [SENTINEL_FEED_NAME],
    );
  } catch {
    // ignore
  }
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
  // Drain the pool so the test process can exit cleanly.
  await mysqlPool.end().catch(() => undefined);
}, 30_000);

type SearchResponse = {
  posts: Array<{ id: number; score?: number; contentFormat: string; sourceFeedId: number | null; createdAt: string }>;
  total: number;
  page: number;
  limit: number;
  query: string;
};

async function search(qs: URLSearchParams | string): Promise<{ status: number; body: SearchResponse | { error: string; field?: string } }> {
  const params = typeof qs === "string" ? qs : qs.toString();
  const res = await fetch(`${baseUrl}/api/posts/search?${params}`);
  const body = await res.json();
  return { status: res.status, body };
}

function withSentinel(extra: Record<string, string>): URLSearchParams {
  // Every test scopes itself to the sentinel author so unrelated
  // production rows never leak into the assertions.
  return new URLSearchParams({ author: SENTINEL_AUTHOR, ...extra });
}

function asSearch(body: SearchResponse | { error: string }): SearchResponse {
  if ("error" in body) throw new Error(`expected success, got error: ${body.error}`);
  return body;
}

describe("GET /api/posts/search — LIKE-only branch (q=9z)", () => {
  it("returns substring matches sorted by created_at DESC and omits the score column", async () => {
    const { status, body } = await search(withSentinel({ q: SHORT_TOKEN, limit: "50" }));
    expect(status).toBe(200);
    const ok = asSearch(body);

    // Posts containing "9z" in content_text: P1, P2, P3, P7, P9.
    // P4 ("zq nobita") does NOT contain "9z" so it must be excluded —
    // case-insensitive LIKE on the literal substring, not a fuzzy match.
    const expectedIds = [ids.P9, ids.P7, ids.P3, ids.P2, ids.P1];
    expect(ok.total).toBe(expectedIds.length);
    expect(ok.posts.map((p) => p.id)).toEqual(expectedIds);

    // No score column: short-token-only queries fall through to the
    // recency-sorted branch, so there's nothing to rank against.
    for (const p of ok.posts) {
      expect((p as { score?: number }).score).toBeUndefined();
    }
    expect(ok.query).toBe(SHORT_TOKEN);
  });
});

describe("GET /api/posts/search — multi-token compound predicate (q=`9z qxnebula9`)", () => {
  it("ORs the FULLTEXT and LIKE branches and ranks score>0 rows ahead of score=0 rows", async () => {
    const { status, body } = await search(
      withSentinel({ q: `${SHORT_TOKEN} ${FULLTEXT_TOKEN}`, limit: "50" }),
    );
    expect(status).toBe(200);
    const ok = asSearch(body);

    // Any-of-terms matches: P1/P2/P3/P9 hit only the LIKE branch
    // (`%9z%`); P5/P6 hit only the FULLTEXT branch (`+qxnebula9*`);
    // P7 hits both. P4 and P8 have neither token and must be absent.
    const returnedIds = ok.posts.map((p) => p.id);
    for (const key of ["P1", "P2", "P3", "P5", "P6", "P7", "P9"]) {
      expect(returnedIds).toContain(ids[key]);
    }
    expect(returnedIds).not.toContain(ids.P4);
    expect(returnedIds).not.toContain(ids.P8);
    expect(ok.total).toBe(7);

    // The route projects a numeric score column whenever the parser
    // produced a FULLTEXT branch. FULLTEXT-matching posts (P5, P6,
    // P7) must score > 0; LIKE-only posts (P1, P2, P3, P9) score 0.
    const scoreById = new Map(ok.posts.map((p) => [p.id, p.score ?? 0]));
    expect(scoreById.get(ids.P5)).toBeGreaterThan(0);
    expect(scoreById.get(ids.P6)).toBeGreaterThan(0);
    expect(scoreById.get(ids.P7)).toBeGreaterThan(0);
    expect(scoreById.get(ids.P1)).toBe(0);
    expect(scoreById.get(ids.P2)).toBe(0);
    expect(scoreById.get(ids.P3)).toBe(0);
    expect(scoreById.get(ids.P9)).toBe(0);

    // Ordering invariant #1: the all-of-terms row (P7) is the only
    // row matching both `9z` *and* `qxnebula9`, and it carries five
    // FULLTEXT-token occurrences vs. one in P5/P6. score DESC ranks
    // it strictly first — that's the regression "all-of-terms ranked
    // first" exists to catch.
    expect(returnedIds[0]).toBe(ids.P7);
    expect(scoreById.get(ids.P7)!).toBeGreaterThan(scoreById.get(ids.P5)!);
    expect(scoreById.get(ids.P7)!).toBeGreaterThan(scoreById.get(ids.P6)!);

    // Ordering invariant #2: all FULLTEXT-band rows precede every
    // LIKE-only row (score DESC primary key). Within the LIKE band
    // the score is 0 for everyone, so created_at DESC fully orders.
    const fulltextBand = new Set([ids.P5, ids.P6, ids.P7]);
    const likeBand = new Set([ids.P1, ids.P2, ids.P3, ids.P9]);
    let lastFulltextIdx = -1;
    let firstLikeIdx = returnedIds.length;
    returnedIds.forEach((id, i) => {
      if (fulltextBand.has(id)) lastFulltextIdx = Math.max(lastFulltextIdx, i);
      if (likeBand.has(id)) firstLikeIdx = Math.min(firstLikeIdx, i);
    });
    expect(lastFulltextIdx).toBeLessThan(firstLikeIdx);

    // Within the LIKE band, the recency tie-breaker holds (score=0
    // for all of them, so created_at DESC is the only ordering
    // signal): P9 > P3 > P2 > P1.
    const likeOrder = returnedIds.filter((id) => likeBand.has(id));
    expect(likeOrder).toEqual([ids.P9, ids.P3, ids.P2, ids.P1]);
  });
});

describe("GET /api/posts/search — empty result set", () => {
  it("returns 200 with total=0 (no error banner) for a query that genuinely matches nothing", async () => {
    const { status, body } = await search(withSentinel({ q: `zznothing${RUN_ID.replace(/-/g, "")}` }));
    expect(status).toBe(200);
    const ok = asSearch(body);
    // No matches is not a client error. A 4xx here would make the UI
    // surface an error banner for a perfectly valid query.
    expect(ok.total).toBe(0);
    expect(ok.posts).toEqual([]);
  });
});

describe("GET /api/posts/search — server error path", () => {
  it("returns 500 {error:'Search failed'} when the DB query throws — never 400", async () => {
    // Narrow stub: only intercept for this one test, just long enough
    // to simulate a DB fault on the SELECT call. The validator gate
    // is upstream of the catch, so a faulted query MUST surface as a
    // 5xx — a 4xx would tell the client to "fix" their query, which
    // they can't.
    const spy = vi
      .spyOn(mysqlPool, "query")
      .mockRejectedValueOnce(new Error("simulated connection loss"));
    try {
      const { status, body } = await search(withSentinel({ q: SHORT_TOKEN }));
      expect(status).toBe(500);
      expect(body).toEqual({ error: "Search failed" });
      // Internal error text must NOT leak.
      expect(JSON.stringify(body)).not.toContain("simulated connection loss");
    } finally {
      spy.mockRestore();
    }
  });

  it("returns 400 with the offending field for genuinely malformed input (gate is upstream of the catch)", async () => {
    // Sanity: the 500 branch above is not masking a real 400.
    const res = await fetch(`${baseUrl}/api/posts/search?page=abc`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field?: string };
    expect(body.field).toBe("page");
  });
});

describe("GET /api/posts/search — filter composition", () => {
  it("date range narrows to a single seeded row when from=to=that day", async () => {
    const { status, body } = await search(
      withSentinel({ q: SHORT_TOKEN, from: "2024-01-03", to: "2024-01-03" }),
    );
    expect(status).toBe(200);
    const ok = asSearch(body);
    // P3 is the only "9z" post created on 2024-01-03. The route's
    // inclusive-upper-bound bump (to + 1 day) is what keeps Jan 3
    // posts in scope; without it this would silently drop to 0.
    expect(ok.posts.map((p) => p.id)).toEqual([ids.P3]);
    expect(ok.total).toBe(1);
  });

  it("sources=native excludes feed-sourced rows (P9 has a source_feed_id)", async () => {
    const { status, body } = await search(
      withSentinel({ q: SHORT_TOKEN, sources: "native", limit: "50" }),
    );
    expect(status).toBe(200);
    const ok = asSearch(body);
    const returnedIds = ok.posts.map((p) => p.id);
    expect(returnedIds).toContain(ids.P1);
    expect(returnedIds).toContain(ids.P3);
    expect(returnedIds).not.toContain(ids.P9);
  });

  it("sources=<feedId> narrows to rows tagged with that feed (just P9)", async () => {
    const { status, body } = await search(
      withSentinel({ q: SHORT_TOKEN, sources: String(testFeedId) }),
    );
    expect(status).toBe(200);
    const ok = asSearch(body);
    expect(ok.posts.map((p) => p.id)).toEqual([ids.P9]);
    expect(ok.posts[0].sourceFeedId).toBe(testFeedId);
  });

  it("format=html narrows to html-format posts only (P4)", async () => {
    // No `q` here: a format-only filter must still scope correctly,
    // which is the round-trip the UI relies on for "filter by
    // format" with no search string typed.
    const { status, body } = await search(withSentinel({ format: "html" }));
    expect(status).toBe(200);
    const ok = asSearch(body);
    expect(ok.posts.map((p) => p.id)).toEqual([ids.P4]);
    expect(ok.posts[0].contentFormat).toBe("html");
  });

  it("composes q + sources + format + date range + author in a single request and pins to one row", async () => {
    // P9 is the only row that satisfies *every* filter at once:
    //   q=9z          → LIKE-only branch hits P9's content_text
    //   sources=<id>  → P9 is the sole row tagged with the test feed
    //   format=plain  → P9 is plain (P4 is html and lacks "9z" anyway)
    //   from/to       → P9 is the only "9z" row on 2024-01-09
    //   author        → scopes to this run's sentinel
    // If any predicate is dropped or AND-glued incorrectly the
    // result count changes — that's exactly the regression the
    // multi-filter composition gate must catch.
    const { status, body } = await search(
      withSentinel({
        q: SHORT_TOKEN,
        sources: String(testFeedId),
        format: "plain",
        from: "2024-01-09",
        to: "2024-01-09",
      }),
    );
    expect(status).toBe(200);
    const ok = asSearch(body);
    expect(ok.posts.map((p) => p.id)).toEqual([ids.P9]);
    expect(ok.total).toBe(1);
    expect(ok.posts[0].sourceFeedId).toBe(testFeedId);
    expect(ok.posts[0].contentFormat).toBe("plain");
  });

  it("combines q + format + date range + author into a single AND chain", async () => {
    // q=qxnebula9 alone matches P5/P6/P7. Adding format=plain keeps
    // them all (they're all plain). Adding from=2024-01-06 trims to
    // P6 + P7. Adding to=2024-01-06 trims to just P6.
    const { status, body } = await search(
      withSentinel({
        q: FULLTEXT_TOKEN,
        format: "plain",
        from: "2024-01-06",
        to: "2024-01-06",
      }),
    );
    expect(status).toBe(200);
    const ok = asSearch(body);
    expect(ok.posts.map((p) => p.id)).toEqual([ids.P6]);
    expect(ok.total).toBe(1);
    // FULLTEXT branch is active, so the score column is projected.
    expect(typeof ok.posts[0].score).toBe("number");
    expect(ok.posts[0].score).toBeGreaterThan(0);
  });
});
