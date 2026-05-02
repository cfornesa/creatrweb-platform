---
name: indieweb-specs
description: >
  Reference for implementing IndieWeb specifications in priority order. Load this
  skill when implementing or modifying rel=me, microformats2, Webmention,
  IndieAuth, Micropub, or WebSub — or when the person asks about IndieWeb
  building blocks, spec compliance, or interoperability. Do not load for
  general design questions or non-spec work.
---

# IndieWeb Specifications — Implement in Priority Order

## Core Principle

Build only what a real UX need demands. A **real UX need** exists
when the person has described a workflow or outcome the spec would
enable. If none is stated, ask before implementing:
*"What would you want users to be able to do that this enables?"*

Higher-priority specs make lower-priority ones more useful, but
they are not always strict dependencies. Do not implement a spec
speculatively — UX before plumbing.

---

## Priority 1 — Identity and Markup

### `rel=me` — Identity Verification
**Advertise:** `<link rel="me" href="…" />` in `<head>`
Also add as `<a rel="me">` on every visible profile link.

**Purpose:** Bidirectional verification that this domain belongs
to the same person as the linked profiles.

**Acceptance criterion:** `npx indiekit check <url>` passes.

**Ask first:** "Which profiles do you want to claim from this
domain?" Confirm each one — rel=me is a public identity statement
and appears in the Irreversible Decisions table.

**Key notes:**
- Verification is bidirectional — the linked profile must also
  link back to this domain.
- Common targets: GitHub, Mastodon, LinkedIn, micro.blog.
- Never add a rel=me link to a profile the person did not name.

---

### microformats2 — Semantic Markup
**Advertise:** Server-rendered HTML only. No `use client`.

**Purpose:** Machine-readable layer on top of human-readable HTML.
Enables Webmention display, IndieAuth authorship, feed readers,
and cross-site interactions.

**Acceptance criterion:** A microformats2 parser extracts a valid
`h-entry` from every post page.

**Ask first:** "Which post types exist on this site?" Build only
the classes the actual post types require.

**Key classes by context:**

| Context | Classes |
|---------|---------|
| Person / site identity | `h-card`, `u-url`, `u-photo`, `p-name` |
| Every post | `h-entry`, `u-url`, `dt-published`, `e-content` |
| Author attribution | `p-author`, nested `h-card` |
| Feed / list page | `h-feed`, contains `h-entry` items |
| Reply / mention | `h-cite`, `u-in-reply-to` |
| Syndication link | `u-syndication` |

**Critical rules:**
- Never remove a microformats2 class without checking which spec
  depends on it. Webmention display, IndieAuth, and feed readers
  all consume these classes.
- microformats2 must be server-rendered. A page that hydrates
  client-side will fail parser checks.
- `e-content` must contain the full post content, not a summary.

---

## Priority 2 — Interaction Infrastructure

### Webmention — Cross-Site Notifications
**Advertise:** `<link rel="webmention" href="/api/webmention" />`

**Purpose:** Receive notifications when other sites link to your
content. Enables cross-site replies, likes, and reposts to appear
on your posts.

**Acceptance criterion:** webmention.rocks tests 1–23 pass.
Run at: https://webmention.rocks/

**Ask first:** "How do you want to handle incoming mentions —
display them automatically, queue for moderation, or ignore them
for now?" Do not build display logic until this is answered.

**Key notes:**
- Validate webmentions asynchronously. Never block the response.
- Sanitize all external `e-content` before rendering — treat it
  as untrusted HTML.
- Sending webmentions must be human-initiated or explicitly
  scheduled. Never auto-send on publish without confirmation.
- Source URL must return a valid page containing a link to target.

---

### IndieAuth — Decentralized Authentication
**Advertise:**
```html
<link rel="authorization_endpoint" href="/auth" />
<link rel="token_endpoint" href="/token" />
```

**Purpose:** Makes this domain an identity provider. Allows the
person to log into other IndieWeb sites using their own URL.

**Acceptance criterion:** indieauth.rocks authorization code
flow passes.
Run at: https://indieauth.rocks/

**Ask first:** "Do you plan to use external publishing clients
or log into other IndieWeb sites?" IndieAuth is in the Irreversible
Decisions table — confirm before activating.

**Key notes:**
- PKCE is mandatory. No exceptions.
- Issue opaque tokens only — no JWTs.
- Exact `redirect_uri` match required on every request.
- `/.well-known/oauth-authorization-server` must return valid
  IndieAuth server metadata.

---

## Priority 3 — Publishing Protocol

### Micropub — External Publishing API
**Advertise:** `<link rel="micropub" href="/api/micropub" />`

**Purpose:** Allows external clients (mobile apps, desktop
editors, CLIs) to create, update, and delete content on this site.

**Acceptance criterion:** micropub.rocks tests 100–300 pass.
Run at: https://micropub.rocks/

**Ask first:** "What is your publishing workflow — do you want
to post from a mobile app, a desktop editor, a CLI, or just
this site's interface?" Build only the post types the person
actually uses. Micropub is in the Irreversible Decisions table.

**Key notes:**
- Verify `delete` scope explicitly before any destructive action.
- Build only the post types the person has described needing.
  Do not scaffold speculative post types.
- `q=config` endpoint must return valid configuration including
  supported post types.

---

## Priority 4 — Real-Time Distribution

### WebSub — Live Feed Updates
**Advertise:**
```html
<link rel="hub" href="[hub-url]" />
<link rel="self" href="[feed-url]" />
```

**Purpose:** Pushes feed updates to subscribers in real time
rather than requiring polling.

**Acceptance criterion:** A subscribed feed reader receives a
new post within 30 seconds of publish.

**Ask first:** "Do you have subscribers who need real-time
updates, or is polling acceptable for now?" WebSub adds
operational complexity — only implement when the UX need is real.

**Key notes:**
- Ping the hub after every publish.
- Both `rel="hub"` and `rel="self"` must appear in the Atom feed.
- The hub URL is typically a third-party service (e.g.
  WebSub.rocks for testing). Document it in docs/dependencies.md.

---

## Spec Dependency Map

Before removing or modifying any spec implementation, check this
dependency chain:

rel=me
└── IndieAuth (uses rel=me for profile discovery)
└── Micropub (requires IndieAuth token validation)

microformats2
└── Webmention display (parses h-entry, h-cite from source)
└── IndieAuth authorship (parses h-card for identity)
└── Feed readers (parse h-feed, h-entry)

WebSub
└── Atom feed (must contain rel=hub and rel=self)


**Never remove a microformats2 class without tracing this map.**
A class that appears unused in the template may be consumed by
an external parser, feed reader, or Webmention handler.

---

## External Test Suite

Run the appropriate test before releasing any spec endpoint:

| Spec | Test suite |
|------|-----------|
| Webmention | https://webmention.rocks/ — tests 1–23 |
| IndieAuth | https://indieauth.rocks/ — auth code flow |
| Micropub | https://micropub.rocks/ — tests 100–300 |
| General | `npx indiekit check <url>` |

These tests are mandatory before merge for any spec route release.
See the Testing and Compliance section of AGENTS.md for the
full pre-merge checklist.

---

## In-Development Specs — Use With Caution

The following specs are undergoing active development and are not
yet broadly implemented [web:1]. Do not implement unless the
person explicitly requests them and understands the stability risk:

- **post-type-discovery** — implied post type inference
- **Microsub** — reader subscription protocol
- **fragmentions** — deep linking into page content
- **salmentions** — salmon-protocol webmentions

Ask the Socratic ownership question before implementing any of
these: "What happens to this feature if the spec changes
significantly before it stabilizes?"

---

> Build only what a real UX need demands.
> UX before plumbing — always.