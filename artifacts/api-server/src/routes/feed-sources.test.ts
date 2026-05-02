import { describe, it, expect, vi } from "vitest";
import { ingestOneItem, isDuplicateKeyError, type IngestDb } from "./feed-sources";
import { normalizeFeedItem } from "../lib/feed-ingest";

const baseSource = { id: 7, name: "Some Blog" };
const normalized = normalizeFeedItem(
  {
    guid: "https://example.com/x",
    link: "https://example.com/x",
    title: "T",
    contentEncoded: "<p>body</p>",
    isoDate: "2026-01-01T00:00:00.000Z",
  },
  baseSource.name,
);

function makeOps(overrides: Partial<IngestDb> = {}): IngestDb {
  return {
    isAlreadySeen: vi.fn().mockResolvedValue(false),
    insertPost: vi.fn().mockResolvedValue(101),
    insertDedupRow: vi.fn().mockResolvedValue(undefined),
    deletePost: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("isDuplicateKeyError", () => {
  it("recognizes mysql2 ER_DUP_ENTRY (errno 1062)", () => {
    expect(isDuplicateKeyError({ errno: 1062, code: "ER_DUP_ENTRY" })).toBe(true);
    expect(isDuplicateKeyError({ errno: 1062 })).toBe(true);
    expect(isDuplicateKeyError({ code: "ER_DUP_ENTRY" })).toBe(true);
  });
  it("returns false for unrelated errors", () => {
    expect(isDuplicateKeyError(new Error("network"))).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
    expect(isDuplicateKeyError(undefined)).toBe(false);
    expect(isDuplicateKeyError({ code: "ETIMEDOUT" })).toBe(false);
  });
});

describe("ingestOneItem — happy path", () => {
  it("inserts post, then dedup row carrying postId", async () => {
    const ops = makeOps();
    const outcome = await ingestOneItem(ops, baseSource, normalized);

    expect(outcome).toBe("imported");
    expect(ops.isAlreadySeen).toHaveBeenCalledWith(7, normalized.guidHash);
    expect(ops.insertPost).toHaveBeenCalledTimes(1);
    expect(ops.insertDedupRow).toHaveBeenCalledTimes(1);
    expect(ops.insertDedupRow).toHaveBeenCalledWith({
      sourceId: 7,
      guidHash: normalized.guidHash,
      postId: 101,
    });
    expect(ops.deletePost).not.toHaveBeenCalled();
  });

  it("uses originalAuthor when present, source name otherwise", async () => {
    const insertPost = vi.fn().mockResolvedValue(102);
    const ops = makeOps({ insertPost });
    const withAuthor = normalizeFeedItem(
      {
        guid: "https://example.com/y",
        link: "https://example.com/y",
        title: "T",
        creator: "Jane Doe",
        contentEncoded: "<p>body</p>",
      },
      baseSource.name,
    );
    await ingestOneItem(ops, baseSource, withAuthor);
    expect(insertPost.mock.calls[0]?.[0].authorName).toBe("Jane Doe");

    const noAuthor = makeOps();
    await ingestOneItem(noAuthor, baseSource, normalized);
    expect((noAuthor.insertPost as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].authorName).toBe(
      "Some Blog",
    );
  });
});

describe("ingestOneItem — already-seen short circuit", () => {
  it("skips both inserts when the item is already in the ledger", async () => {
    const ops = makeOps({
      isAlreadySeen: vi.fn().mockResolvedValue(true),
    });
    const outcome = await ingestOneItem(ops, baseSource, normalized);

    expect(outcome).toBe("skipped");
    expect(ops.insertPost).not.toHaveBeenCalled();
    expect(ops.insertDedupRow).not.toHaveBeenCalled();
    expect(ops.deletePost).not.toHaveBeenCalled();
  });
});

describe("ingestOneItem — atomicity", () => {
  it("does NOT write dedup ledger when post insert fails", async () => {
    // Regression: dedup-first ordering would mark seen on failure.
    const insertPost = vi.fn().mockRejectedValue(new Error("transient db failure"));
    const insertDedupRow = vi.fn();
    const deletePost = vi.fn();

    const ops = makeOps({ insertPost, insertDedupRow, deletePost });

    await expect(ingestOneItem(ops, baseSource, normalized)).rejects.toThrow(
      "transient db failure",
    );
    expect(insertDedupRow).not.toHaveBeenCalled();
    expect(deletePost).not.toHaveBeenCalled();
  });

  it("retries successfully on the next refresh", async () => {
    const failingOps = makeOps({
      insertPost: vi.fn().mockRejectedValue(new Error("boom")),
    });
    await expect(ingestOneItem(failingOps, baseSource, normalized)).rejects.toThrow();
    expect(failingOps.insertDedupRow).not.toHaveBeenCalled();

    const successOps = makeOps();
    const outcome = await ingestOneItem(successOps, baseSource, normalized);
    expect(outcome).toBe("imported");
    expect(successOps.insertPost).toHaveBeenCalledTimes(1);
    expect(successOps.insertDedupRow).toHaveBeenCalledTimes(1);
  });
});

describe("ingestOneItem — concurrent-write race", () => {
  it("deletes orphan post when dedup insert hits ER_DUP_ENTRY", async () => {
    const dupErr = Object.assign(new Error("Duplicate"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
    });
    const insertPost = vi.fn().mockResolvedValue(202);
    const insertDedupRow = vi.fn().mockRejectedValue(dupErr);
    const deletePost = vi.fn().mockResolvedValue(undefined);

    const ops = makeOps({ insertPost, insertDedupRow, deletePost });
    const outcome = await ingestOneItem(ops, baseSource, normalized);

    expect(outcome).toBe("skipped");
    expect(insertPost).toHaveBeenCalledTimes(1);
    expect(insertDedupRow).toHaveBeenCalledTimes(1);
    expect(deletePost).toHaveBeenCalledTimes(1);
    expect(deletePost).toHaveBeenCalledWith(202);
  });

  it("re-throws non-duplicate dedup-insert errors", async () => {
    const insertPost = vi.fn().mockResolvedValue(303);
    const insertDedupRow = vi.fn().mockRejectedValue(new Error("disk full"));
    const deletePost = vi.fn();

    const ops = makeOps({ insertPost, insertDedupRow, deletePost });
    await expect(ingestOneItem(ops, baseSource, normalized)).rejects.toThrow("disk full");
    expect(deletePost).not.toHaveBeenCalled();
  });
});
