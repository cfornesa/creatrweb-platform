import TurndownService from "turndown";
import { decryptSecret } from "../crypto";
import type { PlatformAdapter, SyndicationPayload, SyndicationResult } from "./types";
import type { PlatformConnection } from "@workspace/db";
import { buildSyndicatedContent } from "./content";

type MediumPostResponse = { data: { id: string; url: string } };

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// Medium API v1 issues long-lived tokens with no refresh mechanism.
// No refreshToken method is implemented.
export const mediumAdapter: PlatformAdapter = {
  async publish(connection: PlatformConnection, payload: SyndicationPayload): Promise<SyndicationResult> {
    const token = decryptSecret(connection.encryptedAccessToken!);
    const meta = connection.metadata as { authorId?: string } | null;
    const authorId = meta?.authorId;

    if (!authorId) {
      throw new Error("Medium connection is missing authorId in metadata");
    }

    const markdown = turndown.turndown(buildSyndicatedContent(payload));

    const res = await fetch(`https://api.medium.com/v1/users/${authorId}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        title: payload.title,
        contentFormat: "markdown",
        content: markdown,
        publishStatus: "public",
        canonicalUrl: payload.canonicalUrl,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Medium API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as MediumPostResponse;
    return { externalId: data.data.id, externalUrl: data.data.url };
  },
};
