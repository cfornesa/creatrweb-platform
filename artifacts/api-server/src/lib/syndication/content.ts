import type { Post } from "@workspace/db";
import type { SyndicationPayload } from "./types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveSiteLabel(siteTitle: string | null | undefined, canonicalUrl: string): string {
  const trimmed = siteTitle?.trim();
  if (trimmed) return trimmed;

  try {
    return new URL(canonicalUrl).host;
  } catch {
    return canonicalUrl;
  }
}

export function buildSourceFooter(siteTitle: string | null | undefined, canonicalUrl: string): {
  html: string;
  text: string;
} {
  const label = resolveSiteLabel(siteTitle, canonicalUrl);
  const escapedLabel = escapeHtml(label);
  const escapedUrl = escapeHtml(canonicalUrl);

  return {
    html: `<p><em>Original source at ${escapedLabel}: <a href="${escapedUrl}" class="u-url" rel="noopener noreferrer nofollow" target="_blank">${escapedUrl}</a></em></p>`,
    text: `Original source at ${label}: ${canonicalUrl}`,
  };
}

export function buildSyndicatedContent(payload: Pick<SyndicationPayload, "contentHtml" | "contentFormat" | "sourceFooterHtml" | "sourceFooterText">): string {
  const body = payload.contentHtml.trimEnd();
  if (payload.contentFormat === "html") {
    return `${body}\n${payload.sourceFooterHtml}`;
  }
  return `${body}\n\n${payload.sourceFooterText}`;
}

export function shouldAppendSourceFooter(post: Pick<Post, "sourceFeedId">): boolean {
  return post.sourceFeedId == null;
}
