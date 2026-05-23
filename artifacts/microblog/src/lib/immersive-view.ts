export type ImmersiveImageMetadata = {
  alt?: string | null;
  title?: string | null;
  caption?: string | null;
};

const IMAGE_QUERY_KEYS = {
  alt: "alt",
  title: "title",
  caption: "caption",
} as const;

function base64UrlEncode(value: string) {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf-8").toString("base64url");
  }
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  if (typeof window === "undefined") {
    return Buffer.from(padded, "base64").toString("utf-8");
  }
  return atob(padded);
}

export function normalizeImmersiveImageRef(src: string, origin = window.location.origin) {
  try {
    const resolved = new URL(src, origin);
    if (resolved.origin === origin) {
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
    return resolved.toString();
  } catch {
    return src;
  }
}

export function encodeImmersiveImageRef(src: string, origin = window.location.origin) {
  return base64UrlEncode(normalizeImmersiveImageRef(src, origin));
}

export function decodeImmersiveImageRef(ref: string) {
  return base64UrlDecode(ref);
}

export function resolveImmersiveImageSrc(ref: string, origin = window.location.origin) {
  const decoded = decodeImmersiveImageRef(ref);
  try {
    return new URL(decoded, origin).toString();
  } catch {
    return decoded;
  }
}

export function buildImmersiveImageHref(
  src: string,
  metadata: ImmersiveImageMetadata = {},
  origin = window.location.origin,
) {
  const href = new URL(`/immersive/images/${encodeImmersiveImageRef(src, origin)}`, origin);
  if (metadata.alt?.trim()) {
    href.searchParams.set(IMAGE_QUERY_KEYS.alt, metadata.alt.trim());
  }
  if (metadata.title?.trim()) {
    href.searchParams.set(IMAGE_QUERY_KEYS.title, metadata.title.trim());
  }
  if (metadata.caption?.trim()) {
    href.searchParams.set(IMAGE_QUERY_KEYS.caption, metadata.caption.trim());
  }
  return `${href.pathname}${href.search}`;
}

export function readImmersiveImageMetadata(searchParams: URLSearchParams): ImmersiveImageMetadata {
  return {
    alt: searchParams.get(IMAGE_QUERY_KEYS.alt),
    title: searchParams.get(IMAGE_QUERY_KEYS.title),
    caption: searchParams.get(IMAGE_QUERY_KEYS.caption),
  };
}

export function buildImmersivePieceHref(id: number, versionId?: number | null) {
  const href = new URL(`/immersive/pieces/${id}`, window.location.origin);
  if (versionId && Number.isFinite(versionId) && versionId > 0) {
    href.searchParams.set("version", String(versionId));
  }
  return `${href.pathname}${href.search}`;
}

export function extractPieceEmbedMeta(src: string, origin = window.location.origin) {
  try {
    const url = new URL(src, origin);
    if (!url.pathname.startsWith("/embed/pieces/")) {
      return null;
    }
    const id = Number(url.pathname.split("/").pop());
    if (!Number.isFinite(id) || id <= 0) {
      return null;
    }
    const versionRaw = url.searchParams.get("version");
    const versionId = versionRaw ? Number(versionRaw) : null;
    return {
      id,
      versionId: versionId && Number.isFinite(versionId) && versionId > 0 ? versionId : null,
    };
  } catch {
    return null;
  }
}
