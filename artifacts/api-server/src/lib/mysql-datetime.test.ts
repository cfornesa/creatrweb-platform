import { describe, expect, it } from "vitest";
import { formatMysqlDateTime } from "../../../../lib/db/src/mysql-datetime";

describe("formatMysqlDateTime", () => {
  it("formats a local Date as a naive DATETIME(3) string", () => {
    const date = new Date(2026, 4, 5, 0, 36, 22, 297);
    expect(formatMysqlDateTime(date)).toBe("2026-05-05 00:36:22.297");
  });
});
