/**
 * Per-browser recent search history.
 *
 * Stored in `localStorage` only — never sent to the server, so no PII
 * is logged anywhere outside the user's own machine. Reads are
 * defensive: a malformed value (hand-edited, quota-evicted, etc.)
 * resolves to an empty list instead of throwing.
 */

const STORAGE_KEY = "microblog:recent-searches";
const MAX_ENTRIES = 10;

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    // Some privacy modes throw on access.
    return null;
  }
}

export function getRecentSearches(): string[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function recordRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  const storage = safeStorage();
  if (!storage) return;
  const existing = getRecentSearches();
  // Move-to-front, case-insensitive de-dupe so the same term doesn't
  // pile up under different capitalisations.
  const lower = trimmed.toLowerCase();
  const deduped = existing.filter((q) => q.toLowerCase() !== lower);
  const next = [trimmed, ...deduped].slice(0, MAX_ENTRIES);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full / disabled — silently drop, the feature is best-effort.
  }
}
