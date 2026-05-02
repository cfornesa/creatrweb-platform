---
name: posse-syndication
description: >
  Reference for POSSE (Publish on Own Site, Syndicate Elsewhere)
  implementation, URL slug conventions, syndication target
  configuration, and export endpoint maintenance. Load this skill
  when finalizing URL structure, configuring a syndication target,
  building or auditing export endpoints, or when the person asks
  about canonical URLs, slug generation, or cross-posting strategy.
---

# POSSE and Data Ownership — Syndicate Without Surrendering

## Core Principle

**Publish on Own Site, Syndicate Elsewhere.**

Content lives here first. The canonical URL always points to this
domain. Syndicated copies exist to extend reach — they are not
the record of truth. Every syndicated copy must link back to the
canonical URL on this domain.

Syndication is an act of choice, not an act of delegation.
The person decides where their content goes, when it goes there,
and whether it goes at all. The agent never configures a
syndication target the person did not explicitly name, and never
auto-syndicates without confirmation.

---

## URL Conventions

URL structure is an irreversible decision. Always present a gallery
and ask the person to confirm the slug before finalizing any new
URL. Once a URL is public and linked, it is a permanent promise
to everyone who links to it.

### Choose the Pattern by Content Type

**Time-stamped content** (blog posts, articles, notes, journals) 
/YYYY/MM/DD/<slug> 
Use when the date of writing is part of the permanent identity
of the content. The date is canonical metadata — it belongs in
the URL. Do not use for evergreen pages, reference sections,
or features where "when this was written" is irrelevant.

---

**Evergreen pages** (about, contact, uses, now, colophon)
/<slug>
Use for single pages with no temporal identity and no
meaningful parent section. The page is its own thing.
Example: `/about`, `/uses`, `/now`

---

**Structured collections** (projects, work, talks, recipes)
/<section>/<item-slug>
Use when content belongs to a named category and the
category relationship is part of how the person thinks
about and navigates the content.
Example: `/projects/garden-tracker`, `/talks/indieweb-2026`

---

**Nested sub-items** (iterations, versions, chapters)
/<section>/<parent-slug>/<child-slug>
Use sparingly. Only when the parent-child relationship is permanent and meaningful — not for organizational convenience
that might change.
Example: `/projects/garden-tracker/v2`

---

### Slug Confirmation Protocol

Before finalizing any new URL, present the person with the
proposed slug and a brief explanation of why it was chosen.
Do not silently generate and commit a slug.

**Format:**
Proposed URL: /[path]
Pattern used: [which pattern above and why]
Slug derived from: [title, section, or description]
Alternative: /[alternative] — [one sentence on the trade-off]


Then ask: "Does this feel right, or would you like a different
slug?" Wait for confirmation before creating any file, route,
or redirect that uses this URL.

---

### Slug Pushback Rules

Push back on a proposed slug when it creates a mismatch between
the address and what a visitor would expect to find there.
Do this before building — not after.

**Triggers for pushback:**
- The slug implies a different content type than the actual
  content. Example: `/about` for a page hosting a chatbot,
  `/blog` for a page that is actually a portfolio.
- The slug encodes a temporary state. Example: `/new-projects`,
  `/current-work` — "new" and "current" will be wrong soon.
- The slug is so generic it could mean anything.
  Example: `/stuff`, `/things`, `/page2`
- The slug encodes implementation details.
  Example: `/react-app`, `/v2-beta`, `/temp`

**How to push back:**
State the mismatch in one sentence, then offer a corrected
alternative and ask which the person prefers. Do not refuse
to proceed — surface the issue and let the person decide.

Example:
"The slug `/about` typically signals a personal or team
biography page, but this endpoint is meant to host a chatbot.
A visitor arriving at `/about` would likely expect something
different. An alternative might be `/assistant` or `/chat`.
Which feels right for what you're building?"

---

### Slug Generation Rules
- Source: page title, section name, or explicit description —
  normalized to kebab-case
- Remove stop words only if the slug exceeds 60 characters
- Never truncate in a way that changes meaning
- Notes and untitled posts: use first 5 significant words,
  or a content hash if no meaningful words exist
- Implement in `lib/slug.ts` or `app/utils/slug.py`
  (create if absent, following the active framework profile)

### What Must Never Appear in a Public URL
| Prohibited | Why |
|-----------|-----|
| Database IDs (`/posts/1234`) | Leaks implementation; breaks on migration |
| Post type names in time-stamped URLs (`/articles/`) | Types change; URLs must not |
| Framework internals (`/_next/`) | Breaks on framework change |
| Temporary state (`/new-`, `/current-`, `/temp-`) | Will be wrong soon |
| Session or auth tokens | Security |
| Inconsistent trailing slashes | Causes duplicate content |

### Slug Stability Rule
Once a URL is public — reachable at a domain by anyone with
network access — it must never return a 404. If content moves,
implement a permanent (301) redirect. If content is deleted,
return 410 Gone, not 404 Not Found.

---

## Syndication Targets

### Supported Targets
Configure only targets the person has explicitly named.
Never add a target speculatively.

```json
// config/syndication.json
{
  "targets": [
    {
      "uid": "https://mastodon.social/@user",
      "name": "Mastodon",
      "service": "mastodon",
      "domain-restriction": null
    },
    {
      "uid": "https://bsky.app/profile/user",
      "name": "Bluesky",
      "service": "bluesky",
      "domain-restriction": null
    },
    {
      "uid": "https://micro.blog/user",
      "name": "Micro.blog",
      "service": "microblog",
      "domain-restriction": null
    },
    {
      "uid": "https://linkedin.com/in/user",
      "name": "LinkedIn",
      "service": "linkedin",
      "domain-restriction": "articles-only"
    }
  ]
}
```

### Syndication Link Markup
Every syndicated copy must be linked from the canonical post
using the `u-syndication` microformats2 class:

```html
<a class="u-syndication"
   href="https://mastodon.social/@user/123456">
  Also on Mastodon
</a>
```

This link must be:
- Visible to human readers — not hidden or aria-hidden
- Added after syndication completes, not speculatively
- Present on the canonical post page, not only in feeds

### Syndication Is Human-Initiated
Never auto-syndicate on publish without explicit confirmation.
The mandatory question before configuring any new target:

"This will send your content to [platform name]. Once sent,
[platform] controls the copy — you can delete it there, but
you cannot fully retract it. [Platform]'s terms govern the
syndicated copy. Should I configure this target and document
it in docs/dependencies.md?"

Ask this even when the person appears to have already decided.
Each syndication target is an entry in the Irreversible
Decisions table.

### Per-Post Syndication Control
The person must be able to choose, per post, whether to
syndicate and to which targets. Never build a system that
syndicates all posts to all configured targets automatically.

Implement syndication control as a post-level field:
syndicate-to: mastodon, bluesky

or via Micropub's `mp-syndicate-to` property if Micropub
is implemented.

---

## Export Endpoints

These three endpoints must always be functional. They are
the person's guarantee that their content is portable
regardless of what happens to the platform, framework,
or hosting provider.

Test all three before every merge.

### `GET /export/json` → mf2-JSON
Full site export in microformats2 JSON format. Every post,
every post type, every piece of metadata. This is the
migration path to any other IndieWeb-compatible platform.

```json
{
  "items": [
    {
      "type": ["h-entry"],
      "properties": {
        "name": ["Post title"],
        "content": [{"html": "…", "value": "…"}],
        "url": ["https://example.com/2026/04/10/post-slug"],
        "published": ["2026-04-10T20:00:00Z"],
        "syndication": ["https://mastodon.social/@user/123"]
      }
    }
  ]
}
```

### `GET /feed.xml` → Atom
Standards-compliant Atom feed. Must include `rel="hub"` and
`rel="self"` link elements if WebSub is implemented.

```xml
<feed xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="https://example.com/feed.xml" />
  <link rel="hub" href="https://hub.example.com" />
  <!-- entries -->
</feed>
```

### `GET /feed.json` → JSON Feed 1.1
JSON Feed spec version 1.1. Human-readable alternative to
Atom for feed readers that prefer JSON.

```json
{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "Site Name",
  "home_page_url": "https://example.com",
  "feed_url": "https://example.com/feed.json",
  "items": [
    {
      "id": "https://example.com/2026/04/10/post-slug",
      "url": "https://example.com/2026/04/10/post-slug",
      "title": "Post title",
      "content_html": "…",
      "date_published": "2026-04-10T20:00:00Z"
    }
  ]
}
```

### Export Endpoint Rules
- All three endpoints must return valid output before any merge.
  Add to the pre-merge checklist in AGENTS.md.
- Pagination is acceptable for large archives — but the first
  page must include a `next` link and the full export must
  be reachable by following pagination links.
- Authentication must never be required to access these endpoints.
  Export is a public right, not a logged-in feature.
- Never remove or gate these endpoints. If a framework migration
  would break them, fix the endpoints before completing the
  migration.

---

## POSSE vs. PESOS

**POSSE** (Publish Own Site, Syndicate Elsewhere) — correct.
Content originates here. Canonical URL is here. Syndicated
copies link back.

**PESOS** (Publish Elsewhere, Syndicate Own Site) — avoid.
Content originates on a third-party platform. The person's
site becomes a mirror of someone else's infrastructure.
PESOS is acceptable only as a temporary bridge during
migration away from a platform.

If the person proposes a workflow that is PESOS rather than
POSSE, name the distinction and ask:
"This would make [platform] the origin of your content rather
than your site. That means [platform] controls the canonical
version. Is that the relationship you want with this content?"

---

## SEO and Canonical URLs

Dated, descriptive slugs for time-stamped content satisfy
contemporary SEO guidance and IndieWeb longevity requirements
simultaneously. Evergreen and hierarchical slugs do the same
for their respective content types. There is no structural
conflict between good URL design and search visibility when
the URL follows the pattern appropriate to its content type.

The canonical URL on this domain is the SEO-authoritative URL.
Syndicated copies should use `rel="canonical"` pointing back
to this domain where the platform supports it. Where it does
not, the `u-syndication` link on the canonical post is the
cross-reference record.

Do not modify URL structure to chase algorithmic signals.
URL structure is permanent. SEO guidance is not.

---

## Self-Hosting and Dependency Documentation

Before adding any third-party syndication service or feed
infrastructure, document in `docs/dependencies.md`:

```markdown
## [Service Name]
- Purpose: [what it does in this project]
- Sends data off-domain: yes
- Self-hosting alternative: [name and URL]
- Cost: [free tier / paid tier / open source]
- What breaks if this shuts down: [description]
- Added: [date]
```

This documentation is mandatory. The Socratic ownership
question applies to every syndication dependency:
"What happens to this part of the site if that service
changes its API, pricing, or shuts down?"

---

> Content originates here.
> Everything else is a copy that points home.