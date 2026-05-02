import { describe, it, expect } from "vitest";
import { isPostVisibleToReader } from "../lib/post-visibility";

describe("isPostVisibleToReader — pending visibility (covers /posts/:id and /og/posts/:id)", () => {
  it("allows everyone (incl. anonymous) to read published posts", () => {
    expect(isPostVisibleToReader("published", null)).toBe(true);
    expect(isPostVisibleToReader("published", { role: "member" })).toBe(true);
    expect(isPostVisibleToReader("published", { role: "owner" })).toBe(true);
  });

  it("hides pending posts from anonymous readers", () => {
    expect(isPostVisibleToReader("pending", null)).toBe(false);
  });

  it("hides pending posts from authenticated non-owners (members)", () => {
    expect(isPostVisibleToReader("pending", { role: "member" })).toBe(false);
    expect(isPostVisibleToReader("pending", { role: undefined })).toBe(false);
    expect(isPostVisibleToReader("pending", { role: null })).toBe(false);
  });

  it("allows the owner to read pending posts", () => {
    expect(isPostVisibleToReader("pending", { role: "owner" })).toBe(true);
  });

  it("treats null/undefined status as visible (defensive default for legacy rows)", () => {
    expect(isPostVisibleToReader(null, null)).toBe(true);
    expect(isPostVisibleToReader(undefined, null)).toBe(true);
  });
});
