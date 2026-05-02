import sanitizeHtml, { type IFrame, type Tag } from "sanitize-html";

function isAllowedHttpsUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedIframeSource(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedImageSource(value: string) {
  return value.startsWith("/api/media/") || isAllowedHttpsUrl(value);
}

export function sanitizeRichHtml(input: string): string {
  const sanitized = sanitizeHtml(input, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "blockquote",
      "ul",
      "ol",
      "li",
      "a",
      "h2",
      "h3",
      "hr",
      "img",
      "figure",
      "figcaption",
      "code",
      "pre",
      "iframe",
      "div",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      iframe: [
        "src",
        "width",
        "height",
        "allow",
        "allowfullscreen",
        "frameborder",
        "loading",
        "title",
        "referrerpolicy",
        "sandbox",
      ],
      div: ["style", "data-media-kind", "data-embed-kind"],
      p: ["style"],
      h2: ["style"],
      h3: ["style"],
      figure: ["data-media-kind"],
    },
    allowedSchemes: ["https"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        "text-align": [/^(left|center|right|justify)$/],
      },
    },
    transformTags: {
      a: (tagName: string, attribs: Tag["attribs"]) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      iframe: (tagName: string, attribs: Tag["attribs"]) => ({
        tagName,
        attribs: {
          ...attribs,
          loading: attribs.loading || "lazy",
          frameborder: attribs.frameborder || "0",
        },
      }),
      img: (tagName: string, attribs: Tag["attribs"]) => ({
        tagName,
        attribs: {
          ...attribs,
          loading: attribs.loading || "lazy",
        },
      }),
    },
    exclusiveFilter(frame: IFrame) {
      if (frame.tag === "iframe") {
        return !frame.attribs.src || !isAllowedIframeSource(frame.attribs.src);
      }

      if (frame.tag === "img") {
        return !frame.attribs.src || !isAllowedImageSource(frame.attribs.src);
      }

      if (frame.tag === "a" && frame.attribs.href) {
        return !isAllowedHttpsUrl(frame.attribs.href);
      }

      return false;
    },
  }).trim();

  return sanitized === "" ? "<p></p>" : sanitized;
}
