function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/**
 * Format a JS Date as a naive local timestamp for MySQL DATETIME(3) columns.
 *
 * DATETIME does not store timezone information. Writing ISO UTC strings into
 * DATETIME columns can make freshly created rows look offset into the future
 * or past when the app later reads them back as naive local strings.
 */
export function formatMysqlDateTime(date: Date = new Date()): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  return `${day} ${time}`;
}

/**
 * Format a JS Date as a naive UTC timestamp for MySQL DATETIME(3) columns.
 * Use this for `scheduledAt` so the stored value and scheduler comparison
 * are both UTC regardless of the server's local timezone (Replit = UTC,
 * local dev = any timezone).
 */
export function formatMysqlDateTimeUtc(date: Date = new Date()): string {
  const day = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;
  return `${day} ${time}`;
}
