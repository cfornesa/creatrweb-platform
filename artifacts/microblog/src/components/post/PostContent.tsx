import { useMemo, type ReactNode } from "react";
import type { PostContentFormat } from "@workspace/api-client-react";

type PostContentProps = {
  content: string;
  contentFormat: PostContentFormat;
  className?: string;
  /**
   * Optional whitespace-separated search query. When set, occurrences of
   * each token are wrapped in `<mark>` for visual emphasis only — the
   * underlying post HTML stored on the server is never modified.
   * Matching is case-insensitive and skips text inside `<script>`,
   * `<style>`, and existing `<mark>` nodes.
   */
  highlightQuery?: string | null;
};

function tokenizeQuery(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean);
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHighlightRegex(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;
  // Sort longest-first so an alternation like /(java|javascript)/ doesn't
  // shadow the longer match inside the shorter one.
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  return new RegExp(`(${sorted.map(escapeRegex).join("|")})`, "gi");
}

function highlightPlain(text: string, regex: RegExp): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <mark key={`${m.index}-${parts.length}`}>{m[0]}</mark>,
    );
    last = m.index + m[0].length;
    if (m[0].length === 0) regex.lastIndex++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}

function highlightHtml(html: string, regex: RegExp): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstChild as HTMLElement | null;
  if (!root) return html;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "MARK") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    targets.push(n as Text);
  }
  for (const text of targets) {
    const value = text.nodeValue ?? "";
    regex.lastIndex = 0;
    if (!regex.test(value)) continue;
    regex.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(value)) !== null) {
      if (m.index > last) {
        frag.appendChild(doc.createTextNode(value.slice(last, m.index)));
      }
      const mark = doc.createElement("mark");
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
      if (m[0].length === 0) regex.lastIndex++;
    }
    if (last < value.length) {
      frag.appendChild(doc.createTextNode(value.slice(last)));
    }
    text.parentNode?.replaceChild(frag, text);
  }
  return root.innerHTML;
}

// Same yellow `<mark>` look as the search results page so a click-through
// from /search feels visually continuous.
const MARK_CLASSES =
  "[&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-500/40 [&_mark]:rounded [&_mark]:px-0.5";

const DEFAULT_PLAIN_CLASS =
  "text-base text-foreground whitespace-pre-wrap break-words leading-relaxed";

const DEFAULT_HTML_CLASS =
  "prose prose-neutral max-w-none break-words text-foreground prose-p:my-3 prose-h2:mt-6 prose-h2:mb-3 prose-h3:mt-5 prose-h3:mb-2 prose-img:rounded-xl prose-img:border prose-img:border-border prose-iframe:w-full prose-iframe:rounded-xl prose-iframe:border prose-iframe:border-border";

export function PostContent({
  content,
  contentFormat,
  className,
  highlightQuery,
}: PostContentProps) {
  const terms = useMemo(
    () => tokenizeQuery(highlightQuery ?? ""),
    [highlightQuery],
  );
  const regex = useMemo(() => buildHighlightRegex(terms), [terms]);
  const renderedHtml = useMemo(
    () =>
      regex && contentFormat === "html" ? highlightHtml(content, regex) : content,
    [content, contentFormat, regex],
  );

  if (contentFormat === "plain") {
    const baseClass = className ?? DEFAULT_PLAIN_CLASS;
    const finalClass = regex ? `${baseClass} ${MARK_CLASSES}` : baseClass;
    return (
      <p className={finalClass}>
        {regex ? highlightPlain(content, regex) : content}
      </p>
    );
  }

  const baseClass = className ?? DEFAULT_HTML_CLASS;
  const finalClass = regex ? `${baseClass} ${MARK_CLASSES}` : baseClass;
  return (
    <div
      className={finalClass}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
