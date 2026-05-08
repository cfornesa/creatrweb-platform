import type { PlatformConnection } from "@workspace/db";

export type SyndicationPayload = {
  /** Short title derived from the first ~100 chars of stripped content. */
  title: string;
  /** Full HTML content of the post. */
  contentHtml: string;
  /** Absolute canonical URL on this site, e.g. https://example.com/posts/42 */
  canonicalUrl: string;
};

export type SyndicationResult = {
  externalId: string;
  externalUrl: string;
};

export type TokenRefreshResult = {
  accessToken: string;
  refreshToken?: string;
  /** ISO 8601 datetime string, e.g. new Date(Date.now() + ms).toISOString() */
  expiresAt?: string;
};

export interface PlatformAdapter {
  publish(connection: PlatformConnection, payload: SyndicationPayload): Promise<SyndicationResult>;
  /** Optional — only adapters whose platform issues expiring tokens implement this. */
  refreshToken?(connection: PlatformConnection): Promise<TokenRefreshResult>;
}
