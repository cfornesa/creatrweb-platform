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
