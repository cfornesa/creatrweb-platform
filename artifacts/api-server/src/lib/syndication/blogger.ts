import { decryptSecret } from "../crypto";
import type { PlatformAdapter, SyndicationPayload, SyndicationResult, TokenRefreshResult } from "./types";
import type { PlatformConnection } from "@workspace/db";

type BloggerPostResponse = { id: string; url: string };
type GoogleTokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

export const bloggerAdapter: PlatformAdapter = {
  async publish(connection: PlatformConnection, payload: SyndicationPayload): Promise<SyndicationResult> {
    const token = decryptSecret(connection.encryptedAccessToken!);
    const meta = connection.metadata as { blogId?: string } | null;
    const blogId = meta?.blogId;

    if (!blogId) {
      throw new Error("Blogger connection is missing blogId in metadata");
    }

    const res = await fetch(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind: "blogger#post",
          title: payload.title,
          content: payload.contentHtml,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Blogger API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as BloggerPostResponse;
    return { externalId: data.id, externalUrl: data.url };
  },

  async refreshToken(connection: PlatformConnection): Promise<TokenRefreshResult> {
    const refreshToken = connection.encryptedRefreshToken
      ? decryptSecret(connection.encryptedRefreshToken)
      : null;

    if (!refreshToken) {
      throw new Error("Blogger connection has no refresh token");
    }

    const clientId = process.env.BLOGGER_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.BLOGGER_GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Missing BLOGGER_GOOGLE_CLIENT_ID or BLOGGER_GOOGLE_CLIENT_SECRET");
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Blogger token refresh error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as GoogleTokenResponse;
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : undefined;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };
  },
};
