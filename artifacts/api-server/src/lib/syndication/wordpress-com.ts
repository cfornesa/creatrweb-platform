import { decryptSecret } from "../crypto";
import type { PlatformAdapter, SyndicationPayload, SyndicationResult, TokenRefreshResult } from "./types";
import type { PlatformConnection } from "@workspace/db";

type WpComPostResponse = { ID: number; URL: string };
type WpComTokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

export const wordpressComAdapter: PlatformAdapter = {
  async publish(connection: PlatformConnection, payload: SyndicationPayload): Promise<SyndicationResult> {
    const token = decryptSecret(connection.encryptedAccessToken!);
    const meta = connection.metadata as { blogId?: string | number } | null;
    const siteId = meta?.blogId;

    if (!siteId) {
      throw new Error("WordPress.com connection is missing blogId in metadata");
    }

    const res = await fetch(
      `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/new`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: payload.title,
          content: payload.contentHtml,
          status: "publish",
          format: "standard",
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`WordPress.com API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as WpComPostResponse;
    return { externalId: String(data.ID), externalUrl: data.URL };
  },

  async refreshToken(connection: PlatformConnection): Promise<TokenRefreshResult> {
    const refreshToken = connection.encryptedRefreshToken
      ? decryptSecret(connection.encryptedRefreshToken)
      : null;

    if (!refreshToken) {
      throw new Error("WordPress.com connection has no refresh token");
    }

    const clientId = process.env.WORDPRESS_COM_CLIENT_ID;
    const clientSecret = process.env.WORDPRESS_COM_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Missing WORDPRESS_COM_CLIENT_ID or WORDPRESS_COM_CLIENT_SECRET");
    }

    const res = await fetch("https://public-api.wordpress.com/oauth2/token", {
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
      throw new Error(`WordPress.com token refresh error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as WpComTokenResponse;
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
