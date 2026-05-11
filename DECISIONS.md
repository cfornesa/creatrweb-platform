# Decisions
<!-- IMPORTANT: Load CONSTRAINTS.md and DESIGN.md alongside this
file at every session start. Constraints listed in CONSTRAINTS.md are binding regardless of what is recorded here. Design identity in DESIGN.md informs all gallery
options regardless of session context. -->

## Project Profile

<!-- Operational details for this project. Kept here, not in AGENTS.md,
     to keep the root instruction file framework-agnostic and safe to
     publish. Do not put credentials, hostnames, file paths, or API
     keys here — those belong in .env.

     An agent fills this section during Phase 1 by asking the person
     plain-language questions. If this section is empty, ask before
     writing any code. See AGENTS.md → Detect the Framework. -->

- **Stack:** npm workspaces monorepo; TypeScript throughout; Express 5 API; React 19 + Vite frontend.
- **Deployment:** Node.js application, single-process API server with separate Vite-built frontend artifact.
- **Database:** MySQL via Drizzle ORM.
- **Version pins:** Node 24 direction in repo docs; npm 11.12.1; TypeScript ~5.9.2.
- **Framework AGENTS.md:** No framework-specific AGENTS file is present. Sessions follow root `AGENTS.md`.
- **Profile switch rule:** Stop before touching existing files. Record
  current state and reason here. Confirm new profile explicitly. Flag
  every file needing migration before starting.

---

## REVIEW REQUIRED — Read before starting next session
<!-- Agent writes this block. Human must confirm or override each item before new code is written. -->
- [x] 2026-04-28 Direction-first docs chosen over a pure implementation snapshot so future sessions optimize for the intended product, not just the current stack.
- [x] 2026-04-28 Authentication direction selected for planning: migrate from Clerk toward Auth.js with GitHub + Google as the initial OAuth providers.
- [x] 2026-04-28 Public interaction model is confirmed at a high level: visitors may log in, comment, and react; only the site owner may publish canonical posts.
- [x] 2026-04-28 Initial owner bootstrap policy selected: manual database promotion after the owner's first Auth.js-backed login.

---

## 2026-05-08 — Blog URL Scoping for OAuth Platforms + Optional Post Title Field

### Workstream A — Blog URL per OAuth Platform

#### Trigger
WordPress.com `me/sites` returned the wrong blog ID (the first site on the account, not `fornesus.blog`). Blogger `users/self/blogs` returned empty/403 for accounts in Google Testing mode. Neither platform could reliably discover the correct blog without the owner specifying their blog URL explicitly.

#### Decisions Confirmed
- `platform_oauth_apps` gains a `blog_url VARCHAR(500) NULL` column (additive, provisioned via `ensureColumn` in `lib/db/src/migrate.ts`).
- The `PUT /api/platform-oauth-apps/:platform` endpoint now accepts `blogUrl?: string`. The `GET /api/platform-oauth-apps` list includes `blogUrl` in each row.
- `lib/api-spec/openapi.yaml`: `PlatformOAuthApp` schema has `blogUrl: { type: string, nullable: true }`; `UpsertPlatformOAuthAppBody` has optional `blogUrl`. Codegen re-ran (orval).
- OAuth state store changed from `Map<string, number>` to `Map<string, { expiry: number; blogUrl?: string }>`. `generateState(blogUrl?)` stores the URL alongside the expiry; `verifyState(req)` returns `{ ok, blogUrl }` so callbacks can read it without a second DB query.
- WordPress.com start route: queries `platform_oauth_apps.blogUrl`, passes it to `generateState()`, and adds `url.searchParams.set("blog", blogUrl)` to the authorize URL. This scopes the token to that blog and causes `blog_id` to appear directly in the token response (no `me/sites` fallback needed when `blogUrl` is set; fallback kept as safety net).
- Blogger start route: same DB query + `generateState(blogUrl)`. Blogger callback: primary blog ID lookup via `GET /blogger/v3/blogs/byurl?url=${encodeURIComponent(blogUrl)}` using the access token; falls back to `users/self/blogs` when no `blogUrl` is set.
- `OAuthAppCredentialsDialog` in `/admin/platforms` gains a third input (type="url") for blog URL, with per-platform placeholder text. Pre-populated from the saved row. An "Update app settings" button is added when credentials are already configured, so the dialog can be re-opened even after OAuth has been connected (previously there was no UI path to update `blogUrl` post-connection).
- `adminPlatformsPage` was refactored from an `appConfiguredMap` boolean to an `appMap` full-object map so `blogUrl` is available to each `PlatformCard`.

#### Outcome
- Reconnecting WordPress.com with a saved blog URL routes the token to the correct blog; `blogId` in the connection row is now the blog-scoped ID.
- Blogger now resolves its blog ID via `blogs/byurl` even in Google Testing mode where `users/self/blogs` fails.
- Owner can update blog URL post-hoc without fully disconnecting the platform.

---

### Workstream B — Optional Post Title Field

#### Trigger
Posts had no title column anywhere in the stack, forcing syndication `buildPayload` to use the first 100 characters of content as a title. This caused the same text to appear as an H1 heading + the first line of the post body on WordPress and Blogger. Additionally, owners had no way to write clearly-delineated long-form posts with titles alongside title-less microblog posts.

#### Decisions Confirmed
- `posts` gains a `title VARCHAR(500) NULL` column (additive, provisioned via `ensureColumn`, no default — existing rows get `NULL`).
- `lib/api-spec/openapi.yaml`: `Post` schema has `title: { type: string, nullable: true }`; `CreatePostBody` and `UpdatePostBody` have optional `title: { type: string, maxLength: 500 }`. Codegen re-ran (orval).
- All three GET selects in `artifacts/api-server/src/routes/posts.ts` (`/posts/user/:userId`, `/posts`, `/posts/:id`) now project `title: postsTable.title`.
- `POST /posts`: stores `title?.trim() || null`; empty string → null.
- `PATCH /posts/:id`: if `title` key is present in body, overwrites with trimmed value or null; absent key leaves the column unchanged.
- `RichPostEditor`: added `initialTitle?: string` prop and local `title` state; a native `<input>` above the TipTap editor area (not part of TipTap) shows "Title (optional)" placeholder; `handleSubmit` includes `title: title.trim()` in the payload. `onSubmit` prop type updated to include `title: string`.
- `ComposePost`: destructures `{ title, platformIds, ...rest }` from `onSubmit` payload; passes `title: title || undefined` to `useCreatePost`.
- `PostCard` edit flow: passes `initialTitle` to `RichPostEditor` and includes `title: title || undefined` in `useUpdatePost` mutation payload.
- `PostCard` display: renders `<h2 className="text-lg font-semibold leading-snug mb-1">` above `<PostContent>` when `post.title` is truthy; nothing rendered when title is null.
- Feed generation (`feeds.ts`): `buildAtom` and `buildJsonFeed` now use `post.title?.trim() || summary || \`Post ${post.id}\`` for the feed item `<title>` / `title` field.
- Syndication `buildPayload` (`syndication/index.ts`): returns `title: post.title?.trim() ?? ""`. Empty string means no H1 on WordPress/Blogger — content body appears on its own. The content-derived `stripHtmlToText` import was removed (was only used to fabricate a title from body content, now unused).

#### Outcome
- Owner can write titled long-form posts and title-less microblog posts; the distinction is preserved across all views, feeds, and syndication targets.
- Existing posts continue to render without a title heading (null column → no `<h2>`).
- WordPress and Blogger syndication no longer duplicates the opening body text as a page heading.

---

## 2026-05-08 — Blogger HTML Discovery + Admin Platforms UI Refinements

### Trigger
After implementing blog URL scoping, Blogger connection still failed with HTTP 403 on both `blogs/byurl` and `users/self/blogs`. Root cause: the Blogger API was not enabled in the Google Cloud project and/or the `https://www.googleapis.com/auth/blogger` scope was not added to the OAuth consent screen. Additionally, the admin Platforms page had two UI issues: "Update app settings" showed for unconfigured platforms (creating confusion), and the Blogger setup dialog lacked enough guidance about the scope requirement and Testing vs. Production mode. Medium was also removed from the available platform list because its API restrictions make it unreliable.

### Decisions Confirmed

**Blogger blog ID discovery via public HTML (no API required):**
- Primary blog ID discovery now fetches the blog's public HTML and extracts the numeric blog ID from the Atom feed link embedded in every Blogger page's `<head>`: `href="https://www.blogger.com/feeds/{blogId}/posts/default"`. This works for custom-domain Blogger blogs and requires no Google API access at all.
- `extractBloggerBlogIdFromHtml(blogUrl)` is a module-level helper in `platform-oauth.ts`. On success it logs `"Blogger blog ID extracted from public HTML"`.
- The prior `blogs/byurl` API call is kept as fallback 1, `users/self/blogs` as fallback 2. Both now log the full response body on non-2xx responses so the exact Google error message (e.g. "API has not been used in project…") is visible in server logs.
- Posting to Blogger still requires the Blogger API to be enabled and the scope on the consent screen — that is a Google constraint, not a code constraint.

**"Update app settings" visibility:**
- The condition was `platform.oauthAppPlatform && appConfigured`. Changed to `platform.oauthAppPlatform && isConnected`. The button now appears only when the platform has an active connection, not merely when OAuth app credentials have been saved. This prevents the button from appearing on platforms that have credentials stored but have never completed the OAuth flow.

**Blogger `OAuthAppCredentialsDialog` — expanded setup instructions:**
- Added: enable Blogger API v3 in the library (`APIs & Services → Library`).
- Added: add the `https://www.googleapis.com/auth/blogger` scope to the consent screen (`OAuth consent screen → Scopes → Add or remove scopes`). If this scope is absent, Google issues a token that lacks Blogger access and all API calls fail with 403.
- Added amber callout distinguishing Testing mode (only listed test users can authorize; add your Gmail under `OAuth consent screen → Test users`) from Production mode (no test-user restriction; publishing the app requires Google verification but the Blogger scope is non-sensitive and typically passes without a review).

**Medium removed from the admin Platforms UI:**
- The `medium` entry was removed from the `PLATFORMS` constant, the `MediumTokenDialog` component was deleted, and the `"medium"` literal was dropped from the `credentialKind` union type in `PlatformDef`.
- Reason: Medium's API restrictions (integration tokens unavailable to most account types, write API severely limited) make reliable cross-posting impossible in practice.
- The backend Medium syndication adapter (`syndication/medium.ts`) and the `medium` value in `platform_connections.platform` remain in the codebase. Existing Medium connections are not deleted. The platform is simply no longer offered as a new connection option in the UI.
- This is not treated as an irreversible decision at the data layer: the UI entry can be restored by adding it back to `PLATFORMS` if Medium improves its API access model.

### Outcome
- Blogger connection now succeeds even when the Blogger API is not enabled in Google Cloud, because blog ID discovery reads the public HTML.
- "Update app settings" is no longer visible on platforms that have app credentials but are not yet connected.
- The Blogger credentials dialog is now a complete setup guide: covers credential creation, API enablement, scope configuration, and the Testing/Production mode distinction.
- Medium no longer appears in the post composer's platform selector or in the admin Platforms page.

---

## 2026-05-06 — Feed Routes Moved Under `/api` + Local Port Change to 4000

### Trigger
Feed URLs generated by the catalog (`/feed.xml`, `/feed.json`, etc.) were being intercepted by the Replit proxy before reaching Express in both `*.replit.dev` and `platform.creatrweb.com` (which is a CNAME to `*.replit.dev`, not a Replit production deployment). All clickable feed links in the `/feeds` page returned the React SPA's 404 view. An intermediate fix using extension-free routes (`/atom`, `/jsonfeed`, etc.) also failed — the true root cause is that the Replit proxy only forwards `/api/*` paths to Express; all other paths, regardless of extension, are served as the SPA. Separately, `npm run dev` failed locally because macOS AirPlay Receiver holds port 5000.

### Decisions Confirmed
- Feed content route handlers added to `feeds-catalog.ts` (which is inside the API router, accessible under `/api`). New primary URLs: `/api/feeds/atom`, `/api/feeds/json`, `/api/feeds/mf2`, `/api/categories/:slug/feeds/atom`, `/api/categories/:slug/feeds/json`, `/api/p/:slug/feeds/atom`, `/api/p/:slug/feeds/json`.
- `feeds-catalog.ts` `FEEDS` constant and all category/page URL generation updated to reference the `/api`-prefixed paths as primary links.
- All original routes (`/feed.xml`, `/feed.json`, `/atom`, `/jsonfeed`, `/export/json`, `/export.json`, and per-category/per-page variants) are kept as backward-compatible aliases in `feeds.ts` — Rule 5 preserved.
- Builder functions (`buildAtom`, `buildJsonFeed`, `buildMf2Export`, `buildPageAtom`, `buildPageJsonFeed`) and data-loading helpers (`loadPosts`, `loadCategoryBySlug`, `loadPublishedPageBySlug`) exported from `feeds.ts` so `feeds-catalog.ts` can import them without duplication.
- `.env` `PORT` changed from 5000 → 4000 for local development. `ALLOWED_ORIGINS` and `AUTH_URL` updated to match. Replit workflow (`PORT=5000 npm run dev`) continues to override for Replit environments.

### Outcome
- All feed links on the `/feeds` page are clickable and return feed content in every environment (local, `*.replit.dev`, `platform.creatrweb.com`).
- Legacy subscribers using `/feed.xml`, `/feed.json`, `/atom`, `/jsonfeed`, or `/export/json` URLs are unaffected — those routes still respond.
- Local `npm run dev` starts without conflict at `http://localhost:4000`.

---

## 2026-05-06 — Replit Port Routing and Feed Route Proxy Workaround

### Trigger
After migrating to a Replit-managed workflow (`PORT=5000 npm run dev`, `externalPort = 80 → localPort = 5000`), the default Replit webview URL and `platform.creatrweb.com` began serving the homepage correctly, but feed routes (`/feed.xml`, `/feed.json`, etc.) returned the React NotFound page in the dev webview. Root cause confirmed by screenshot: the Replit webview proxy intercepts file-extension paths (`.xml`, `.json`) and serves `index.html` directly without forwarding to Express.

### Decisions Confirmed
- `PORT=5000` is the canonical port across all environments. `.env` updated from 8080 → 5000. `ALLOWED_ORIGINS` and `AUTH_URL` in `.env` updated to reference `localhost:5000`.
- Replit `.replit` `[[ports]]`: `externalPort = 80 → localPort = 5000` (default webview/custom domain); `externalPort = 5000 → localPort = 5000` (direct port access, bypasses webview proxy for feed route testing).
- The Replit webview proxy limitation is accepted as a dev-only constraint. Feed routes are verified via direct `:5000` port access in dev and are fully functional on the production deployment (`platform.creatrweb.com`) where `router = "application"` forwards all paths to Express.
- All stale `[[ports]]` entries from the pre-workflow era were removed from `.replit`.

### Outcome
- Default webview URL and `platform.creatrweb.com` serve the app correctly for all non-extension routes.
- Feed routes (`/feed.xml`, `/feed.json`, `/export.json`, category and page feeds) are functional in production and testable via `https://[repl]:5000/feed.xml` in dev.

---

## 2026-05-06 — Host-Agnostic Feed URL Generation

### Trigger
Feed URLs (`/feed.xml`, `/feed.json`, category and page feeds) worked on the Replit dev URL (direct to Express) but returned 404 on the `platform.creatrweb.com` custom domain. Root cause: Replit's deployment CDN intercepts requests for paths with file extensions (`.xml`, `.json`) as static file requests before they reach Express. `PUBLIC_SITE_URL` was the authoritative origin override in `getOrigin()`, locking generated feed URLs to a single configured host regardless of the actual request origin.

### Decision Confirmed
Removed the `PUBLIC_SITE_URL` short-circuit from `getOrigin()` in both `feeds.ts` and `feeds-catalog.ts`. Origin is now derived exclusively from the request: `x-forwarded-proto`/`x-forwarded-host` (set by Replit's proxy for custom domains), falling back to `req.protocol`/`req.get("host")` for local. `PUBLIC_SITE_URL` remains in use for AI HTTP-Referer headers (`ai-providers.ts`) and OG meta tags (`meta-injection.ts`).

### Outcome
- Feed catalog and feed content URLs reflect the actual request host in every environment: local, Replit dev, and Replit production.
- No URL structure changes — Rule 5 preserved.
- `PUBLIC_SITE_URL` can be kept or removed from `.env` without affecting feed behaviour.

---

## 2026-05-06 — Feed Source Author Name, Edit UI, Display Name Cascade, Feed Post Attribution

### Decisions Confirmed

- `feed_sources` gains an optional `author_name VARCHAR(255) NULL` column. Provisioned via `ensureColumn` in `lib/db/src/migrate.ts`; no manual SQL required on existing deploys.
- `author_name` on a feed source is the owner-controlled override for all posts ingested from that source. Priority at ingest time: `source.authorName || normalized.originalAuthor || source.name`.
- The `/admin/feeds` "Add a source" form now includes an optional "Author Name" field. Each existing source card has an Edit button (pencil icon) that expands an inline form for Name, Author Name, Feed URL, and Site URL. The `PATCH /api/feed-sources/:id` endpoint already supported these fields; this was a frontend-only addition for the edit panel.
- Feed-imported post **byline** on the timeline now shows the blog/source name (`sourceFeedName`) rather than `author_name`. `author_name` surfaces in the attribution line as "by `<author_name>` via `<sourceFeedName>`" when the two values differ. When they are the same (no individual author to surface separately), the attribution collapses to "via `<sourceFeedName>`". This is a display-only change in `PostCard.tsx` — no schema or API changes required.
- `PATCH /api/users/me` now cascades a display name change to `posts.author_name` for all posts where `author_user_id = userId`. Feed-imported posts (`author_user_id = NULL`) are not touched. Comment `author_name` rows are not rewritten — comments retain the name as it was when posted.

### Options Considered

- **Separate `source_author` column on `posts`**: would have cleanly separated the "custom/blog author name shown in byline" from "individual feed item author shown in attribution" at the schema level. Rejected in favour of the display-layer heuristic (`authorName !== sourceFeedName` → show "by X via Y") to avoid a schema migration for what is ultimately a presentational distinction.
- **Name cascade via JOIN at read time**: dynamically joining `users.name` on every post SELECT instead of writing back to `posts.author_name`. Rejected — adds JOIN overhead to every post list query and would be invisible to cached or exported content.

---

## 2026-05-06 — Home Feed Category And Source Filter Dropdowns

### Decisions Confirmed
- `GET /api/posts` now accepts two optional query parameters — `category` (a category slug or the special token `"uncategorized"` for posts with no assigned category) and `source` (`"original"` for posts with no feed source, or a numeric feed source ID) — enabling server-side filtering of the full post archive rather than client-side filtering of a fixed window.
- `"uncategorized"` is a permanent API token, not an actual database row; it maps to a `NOT EXISTS` subquery against `post_categories`.
- `"original"` covers both native (owner-authored) posts and posts whose source feed has since been deleted, because the database sets `source_feed_id = NULL` on source deletion (`ON DELETE SET NULL`).
- The home feed controls bar (Sort / Filter / Category / Source dropdowns) must always be visible once the initial page load completes, regardless of how many posts the current filter returns.
- The label text ("Posts / Sort and filter through my posts.") must always appear above the dropdown row, never beside it, at any viewport width.

### Implementation Notes
- Two new parameters were added to `GET /api/posts` in `lib/api-spec/openapi.yaml`; codegen regenerated `lib/api-zod` and `lib/api-client-react`.
- `notExists` was added to the `@workspace/db` re-exports (`lib/db/src/index.ts`) so the backend route can build the uncategorized subquery via Drizzle without a direct drizzle-orm import.
- The `GET /posts` route in `artifacts/api-server/src/routes/posts.ts` builds a shared `conditions[]` array applied to both the data query and the `total` count query, so pagination totals reflect the filtered set.
- `artifacts/microblog/src/pages/home.tsx`: added `categoryFilter` and `sourceFilter` state; `useListCategories()` and `useListPublicFeedSources()` hooks populate the dropdowns; non-`"all"` values are passed as query params to `useListPosts()` so React Query refetches from the server on filter change.
- The controls bar render condition was changed from `!isLoading && postsPage.posts.length > 0` to `!isLoading`, making it permanently visible after the skeleton loading phase.
- The outer flex container was changed from `flex-col md:flex-row` to always `flex-col` so label text is always stacked above the dropdown row.

### Operational Outcome
- Selecting a category or source on the homepage correctly surfaces all matching posts across the full archive, not just those in the initial 50-post window.
- Posts from deleted feed sources automatically appear under "Original" with no manual intervention.
- The controls bar remains usable when a filter yields zero results, so visitors are never left stranded on an empty page without a way to change their selection.

---

## 2026-05-09 — Validated P5 Draft Pipeline For Interactive Pieces

### Trigger
AI-generated `p5` piece drafts could return malformed JavaScript that passed the original shape checks, showed a broken preview (`Unexpected token ')'`), and could still be saved if the owner ignored the preview failure. The product direction was tightened: every surfaced draft must already work, attempts should be visible, and generation should be cancellable and time-bounded.

### Decisions Confirmed
- V1 interactive pieces remain locked to persisted `engine = 'p5'`.
- The generation contract changed from raw AI-authored sketch code to a structured sketch-spec JSON response. The API now compiles the spec into app-owned `p5` instance-mode code.

---

## 2026-05-10 — Multi-Engine Interactive Pieces (`p5`, `c2`, `aframe`, `three`)

### Trigger
The interactive piece system was hard-wired to persisted `engine = 'p5'`, a single `p5`-specific structured schema, a `p5` compiler/preflight path, and `P5PieceRenderer`-only previews/embeds. The owner confirmed the product should expand to support `c2`, `aframe`, and `three` using the same compile-first safety model.

### Decisions Confirmed
- The persisted art-piece engine contract is now the four-value enum `p5 | c2 | aframe | three`. This is an intentional irreversible expansion of the saved API/database surface.
- A single piece may accumulate versions across different engines. The current version defines the piece's canonical `art_pieces.engine`, and saving a new current version in a different engine updates the parent piece's engine to match.
- The owner explicitly chooses the target engine when generating a piece. The model never auto-selects the runtime.
- All engines follow the guarded structured-spec pipeline: AI returns strict JSON, the app validates it against an engine-specific schema, compiles it into app-owned runtime code, server-preflights that code, and only validated draft tokens may be saved.
- Official self-hosted runtime dependencies were added for the new engines and documented in `docs/dependencies.md`: `c2.js`, `aframe`, and `three`.
- The old backend-only standalone `p5.min.js` embed route is no longer the active rendering path. `/embed/pieces/:id` now relies on the existing frontend route so the same engine-aware renderer boundary can power both admin previews and live embeds without changing embed URLs.

### Outcome
- Owners can generate and preview interactive pieces in four runtimes while keeping the existing draft-token, timeout, retry, and vendor-selection behavior.
- Existing `p5` pieces remain valid with no content migration beyond the engine enum expansion.
- Interactive piece previews and embeds now dispatch by saved `version.engine` instead of assuming `p5`.
- The API must perform server-side validation before returning any draft: parse the structured JSON, compile it, syntax-check it, and run a lightweight Node-side `p5` preflight against a mocked runtime wrapper.
- Invalid model output no longer surfaces directly. The API performs a bounded repair loop, feeding validation failures back into the model until a working draft is produced or the attempt/timeout budget is exhausted.
- Generation is bounded by a one-minute timeout and a fixed attempt budget. Attempt usage is surfaced in the UI as part of the generation and preview flow.
- The save path no longer accepts arbitrary browser-supplied `generatedCode`. Instead, `POST /art-pieces` and `POST /art-pieces/:id/versions` require a one-time validated draft token issued by the generation pipeline.
- `art_piece_versions` now persist the structured spec, compiled code, validation status, and generation attempt count so saved pieces remain inspectable and version-pinned.

### API / Schema Outcome
- `POST /api/art-pieces/generate` now returns a validated draft payload containing `draftToken`, `structuredSpec`, compiled `generatedCode`, `validationStatus`, `attemptCount`, `maxAttempts`, `timedOut`, `cancelled`, and `wasRepaired`.
- `CreateArtPieceBody` and `CreateArtPieceVersionBody` were narrowed to token-based save requests instead of raw code payloads.
- `art_piece_versions` gained `structured_spec`, `validation_status`, and `generation_attempt_count` columns via additive runtime migration and install-script updates.

---

## 2026-05-10 — A-Frame Rolled Back From Interactive Pieces; Three.js Preview Warning Relaxed

### Trigger
A-Frame generation proved too brittle and visually unreliable for the current interactive-piece product direction, while Three.js previews could visibly render and still surface a false browser-side warning that implied the draft was broken. The owner explicitly approved a full A-Frame rollback, including removing the saved/API enum value and hard-disabling legacy A-Frame content, rather than merely hiding it in the UI.

### Decisions Confirmed
- The persisted art-piece engine contract is now narrowed from `p5 | c2 | aframe | three` to `p5 | c2 | three`. This is an intentional breaking rollback of the previously expanded enum.
- A-Frame generation, preview, embed rendering, and engine selection were removed from the owner-facing interactive-piece system. Incoming `aframe` generation/save attempts must now fail at the API boundary because `aframe` is no longer a valid engine.
- Existing saved A-Frame content is intentionally no longer supported. Runtime migration removes `art_piece_versions.engine = 'aframe'`, repoints affected parent pieces to their latest remaining supported version when possible, and deletes orphaned parent pieces that no longer have any supported versions.
- The self-hosted dependency record was updated to remove A-Frame as an active interactive-piece runtime. Active AI-generated interactive engines are now `p5`, `c2`, and `three`.
- Three.js preview readiness was relaxed so a scene with a camera and visible meshes no longer surfaces the false “did not render a frame” warning purely because the browser-side heuristic observed rendering late.

### Outcome
- Owners can now generate interactive pieces in `p5`, `c2`, and `three` only.
- Legacy A-Frame pieces and embeds are intentionally hard-disabled by data cleanup plus contract rollback, so future sessions should not assume backward compatibility for `aframe`.
- Three.js drafts that visibly render no longer send mixed signals by showing a warning while still being saveable.

### Product Outcome
- The composer and Admin Pieces flows now show a generation-progress dialog with a `Stop` action and `Attempts: X / Y`.
- A piece draft dialog only opens after server validation succeeds.
- Saving is gated by both the server-validated token and a successful browser-side preview render.
- Existing saved pieces remain renderable; rows without historical structured specs are tolerated as legacy data during serialization.

---

## 2026-05-06 — Profile Display Names, Safer Theme Reset, And Post Editor Refinement

### Decisions Confirmed
- Signed-in users may now edit their public display name through `/settings`, while `username` remains the stable `@handle` used in profile URLs.
- Every account must keep a non-empty public display name; blank or whitespace-only `name` values are rejected at both the frontend form layer and the `PATCH /api/users/me` API boundary.
- The owner-facing "Reset to Bauhaus defaults" action in Site Customization must be non-destructive: it resets only theme, palette, and the 14 color values, and must never reset site copy or CTA links.
- The post composer and post edit flow now intentionally use a denser WYSIWYG-style toolbar with compact square controls, without changing the broader site theme or global button language.
- The post editor now supports heading levels `H1` through `H6` and direct YouTube URL insertion in addition to the existing image upload and generic iframe embed paths.
- The bold-formatting regression was resolved at the rendering layer as well as the command layer, so `strong` text now remains visibly heavier in both the live editor and rendered rich post content.

### Implementation Notes
- `UpdateUserProfileBody` and `PATCH /api/users/me` now include `name` as a first-class editable field, with trimming and non-empty validation.
- The Settings page profile form now exposes a required Display name input alongside username, bio, website, and social links.
- Existing historical `posts.author_name` and `comments.author_name` rows were intentionally not bulk-rewritten; new content uses the current display name while older stored bylines remain unchanged.
- The shared `RichPostEditor` toolbar was reorganized around compact grouped controls plus a `More` dropdown for secondary actions on smaller viewports.
- YouTube insertion now accepts normal `youtube.com` and `youtu.be` URLs and normalizes them into the existing iframe embed node shape, rather than requiring raw iframe code for that common case.
- The docs sweep for this session updated README, replit.md, auth setup notes, dependency notes, and shared memory/decision records to reflect the shipped behavior.

### Operational Outcome
- Public profile identity is now clearer: a person can keep a stable handle while changing the public name shown on the site.
- Owners can safely reset visual styling to Bauhaus defaults without risking site-text loss.
- The post authoring surface now behaves more like a conventional document editor while preserving the app's existing sanitization and trust boundaries.

---

## 2026-05-06 — Feeds Catalog Fix And Sectioned /feeds Page

### Decisions Confirmed
- Feed route URL generation now uses `PUBLIC_SITE_URL` as the canonical origin override when set, falling back to the `x-forwarded-host` header and then to Express `req.protocol`/`req.get("host")`. Both `feeds.ts` and `feeds-catalog.ts` apply the same `getOrigin()` logic so generated feed URLs are correct regardless of reverse-proxy configuration.
- The feeds catalog (`GET /api/feeds`) now always includes every category's Atom and JSON Feed entries, without requiring a `?category=<slug>` query parameter. The former `?category` param is retained for backwards compatibility but is now a no-op; callers get a valid response regardless.
- The `/feeds` page now organises feeds into visual sections rather than a single flat list: a "Site Feeds" section for the three standard formats (Atom, JSON Feed, Microformats2), followed by one section per category in alphabetical order, and optionally a per-page section when `?page=<slug>` resolves a published page.
- Category section headings use the category's human-readable name. Within a section, the redundant "— CategoryName" suffix is stripped from card titles because the heading already names the category.
- No OpenAPI schema or codegen changes were made; grouping is done client-side from the existing flat `SiteFeed[]` response using slug-prefix detection. Extending the contract would be an irreversible change.

### Implementation Notes
- `getOrigin()` in both `artifacts/api-server/src/routes/feeds.ts` and `artifacts/api-server/src/routes/feeds-catalog.ts` was updated to the same three-tier origin resolution: `PUBLIC_SITE_URL` env var → `x-forwarded-host` header → `req.protocol`/`req.get("host")`.
- `feeds-catalog.ts` replaced the conditional `?category=<slug>` block with an unconditional `SELECT slug, name FROM categories ORDER BY name ASC` query so every catalog response includes all current categories.
- `feeds.tsx` gained a `FeedGroup` type, a `SITEWIDE_SLUGS` set, and a `groupFeeds()` pure function that partitions the flat feed list into sitewide / category / page groups using slug-prefix matching.
- The two-level render iterates over `groups`, emits an `<h2>` section heading for each, then maps cards inside. Non-sitewide sections compute `displayTitle` by stripping `/ — .*$/` from the feed title.
- Tests in `feeds-catalog.route.test.ts` were updated: the strict `toEqual(["atom", "json", "mf2"])` assertion was replaced with `toContain` checks, and a new integration test confirms all-categories are present in the default (no-param) response.

### Category Lifecycle — No Code Changes Required
- Adding a category automatically appears on the next `/api/feeds` request; no deploy is needed.
- Deleting a category removes it from the next `/api/feeds` request. The actual per-category feed routes already return HTTP 404 for non-existent slugs. `post_categories` rows cascade away on category delete; posts themselves are unaffected.

### Operational Outcome
- Feed links on the `/feeds` page now resolve to correct absolute URLs in all proxy and reverse-proxy configurations.
- The `/feeds` page is self-describing: a visitor can see at a glance that separate category-scoped feeds exist, without needing to know category slugs in advance.

---

## 2026-04-29 — Canonical MySQL Datastore

### Decisions Confirmed
- MySQL is now the canonical datastore for both deployed publishing and local authoring workflows.
- SQLite is no longer the intended long-term runtime datastore for the app; it is now legacy import material only.
- The app now uses one shared database model across local and deployed runtimes so edits made locally can be reflected in the deployed site.
- The Hostinger build-coupled SQLite workflow is considered superseded because it allowed deployed content to be replaced by build-scoped database state.
- The runtime connection contract now centers on `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASS`.
- Auth.js persistence, posts, comments, reactions, and feed-backed content reads are now intended to live in the same MySQL database.
- Owner-authored rich posts may now include iframe embeds from any `https:` source, with the owner acting as the trust boundary for embedded content.

### Implementation Notes
- The shared Drizzle runtime was migrated from `libsql`/SQLite wiring to a MySQL-backed connection layer.
- The database schema definitions were rewritten from SQLite-specific table primitives to MySQL-compatible ones.
- Backend create/update flows that previously relied on `.returning()` were adjusted for MySQL-compatible insert/update behavior.
- A one-time import script now exists to copy legacy SQLite content into the canonical MySQL datastore.

### Operational Outcome
- Local publishing is no longer conceptually separate from deployed publishing; both are expected to act on the same canonical content store when pointed at the same MySQL database.
- Future sessions should reason about content continuity, auth persistence, and deployment safety through MySQL rather than through local SQLite files.

### Unresolved Checkpoints Entering Next Session
- [ ] Verify the final Hostinger production environment variables point at the intended canonical MySQL database rather than any legacy SQLite-backed runtime.
- [ ] Decide whether the legacy SQLite file and related import scaffolding should remain in-repo for recovery purposes or be removed after production verification.

---

## 2026-04-29 — Authoring, Feeds, And Runtime Recovery

### Decisions Confirmed
- The site now supports two post content modes: legacy plain-text posts and rich posts stored as sanitized HTML with a `content_format` field.
- Rich post creation and editing are owner-only and use a toolbar-backed editor rather than a plain textarea.
- Rich post HTML is sanitized on the server before persistence; stored rich content is rendered as HTML on the frontend after that server-side sanitization step.
- Rich posts support local image uploads and owner-trusted `https:` iframe embeds rather than arbitrary unsanitized HTML.
- Comments remain plain text, but authenticated users can now edit their own comments inline after posting.
- The homepage composer is now collapsed by default and expands only when the owner explicitly chooses to start a post.
- The homepage feed now supports client-side browsing controls for sort and filter operations instead of remaining a fixed reverse-chronological list.
- Standardized public feeds are now part of the app surface: `/feed.xml` serves Atom, `/feed.json` serves JSON Feed 1.1, and `/export/json` serves mf2-JSON export.
- `GET /export.json` was retained as a compatibility alias so the repo's export URL guarantee remains intact while also honoring the newly approved `/export/json` route.
- Feed item URLs continue to use the current canonical post route shape of `/posts/:id`; no slug migration was introduced in this session.
- Feed summaries are generated from the first 50 visible characters of post content and append `...` only when truncation occurs.
- Feed autodiscovery is now exposed from the frontend document head through `<link rel="alternate">` tags for Atom and JSON Feed.

### Implementation Notes
- Auth.js on Express 5 now mounts at `/auth` rather than a wildcard route because the earlier wildcard pattern conflicted with Express 5 routing behavior and Auth.js action parsing.
- The backend now exposes comment-update behavior alongside the existing comment create/delete flow.
- Rich-post persistence required API contract changes, schema evolution for posts, and frontend rendering that distinguishes plain text from sanitized HTML.
- Local media uploads are handled by the app server itself, with validation and rate-limiting support added alongside the upload route.
- The frontend rich editor is shared across create and edit flows so the authoring controls remain consistent.

### Runtime Recovery
- The originally approved server sanitizer stack of `DOMPurify + jsdom` proved non-functional in the repo's bundled API runtime because `jsdom` attempted to read files that were not present in the bundled deployment shape.
- In accordance with the root AGENTS rule for non-functional specified tech, implementation stopped, alternatives were surfaced, and the replacement path required explicit sign-off before proceeding.
- The backend sanitizer was then replaced with `sanitize-html`, restoring a bootable API while preserving the sanitized-HTML storage model already approved for rich posts.
- Restarting the backend after that recovery applied the pending posts migration, including the `content_format` column needed for rich post saves to work correctly.

### Resulting Product Shape
- The site now behaves as a single-author publishing space where the owner can compose rich posts with formatting, uploads, and owner-trusted embeds, while signed-in visitors can comment and edit their own comments.
- Visitors can browse posts with sort and filter controls and can consume the site's content through standardized feed and export endpoints without authentication.

### Unresolved Checkpoints Entering Next Session
- [ ] Decide whether post canonicals should remain `/posts/:id` long-term or later migrate to a slugged archive structure without breaking existing feed/export URLs.
- [ ] Decide whether comments should remain plain-text-only long-term or later gain lightweight formatting support.
- [ ] Decide whether local media uploads remain the long-term storage plan or whether they should later move to managed object storage for deployment portability.

---

## 2026-04-29 — Session Record Recovery

### Decisions Confirmed
- `MEMORY.md` was effectively empty even though `DECISIONS.md`, `CONSTRAINTS.md`, project docs, and the working tree showed substantial prior progress.
- The recovery approach for this session is evidence-only backfill rather than speculative reconstruction.

### Recovery Sources Used
- Existing project records in `DECISIONS.md`, `CONSTRAINTS.md`, and `DESIGN.md`.
- Current setup docs including `docs/auth-setup.md` and `env.example`.
- Current repo metadata including `package.json`, the working tree, and recent git commit history.

### Guardrails
- No new product, auth, or architecture decisions were introduced as part of this recovery pass.
- Any future historical gaps should be recorded explicitly as unknown rather than inferred.

---

## 2026-04-28 — Direction Setting Session

<!-- Created by the agent at session start.
     Record every significant decision made during this phase.
     Use bullet points. One fact per bullet.
     Flag gaps or deferred items as noted below. -->

### Stack Confirmed
- Workspace uses npm workspaces with TypeScript across packages.
- API server is Express 5.
- Frontend is React 19 with Vite.
- Persistence is MySQL through Drizzle ORM.
- Current auth implementation is Clerk for web sessions.

### Product Direction Confirmed
- The site is evolving toward a personalized social platform centered on engagement with the author's ideas.
- Publishing is owner-controlled: canonical posts originate from the site owner only.
- Visitor participation is interaction-focused rather than publishing-focused: authenticated visitors should be able to comment and react.
- Identity direction should favor open, portable, low-cost approaches over centralized providers when feasible.

### Design References Confirmed
- `bluesky.net` is the primary interface/style reference.
- `fornesus.blog` is the primary background/atmosphere reference.

### Structural Implications Identified
- Auth must be decoupled from publishing authority. Logging in and posting can no longer be treated as the same permission boundary.
- The data model will likely need explicit user roles or capabilities so the owner retains publish rights while other authenticated users receive interaction-only permissions.
- The current comment system can stay conceptually, but it should be refit around durable visitor identities rather than a single-provider assumption.
- Reactions do not appear to exist as a first-class feature yet and will likely require a dedicated persistence model and API surface.
- If open identity is pursued, account linkage will likely need a more flexible identity model than a single provider user ID.
- Moderation and trust boundaries become first-order concerns once public sign-in is enabled for commenting and reactions.

### Irreversible Decisions Deferred
- Auth migration direction and initial provider set are selected, but exact endpoint structure and owner bootstrap mechanics are still deferred.
- No `rel=me`, IndieAuth, Micropub, or syndication target decisions have been made yet.
- No public URL restructuring has been authorized.

### Environment Variables Required
- `PORT`
- `ALLOWED_ORIGINS`
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `DATABASE_PATH` (optional in current implementation)
- `LOG_LEVEL` (optional in current implementation)

### Gaps and Deferred Items
- Add or revise the dependencies document if the provider set or auth architecture changes later.
- Decide later whether manual owner promotion should remain the long-term policy or be replaced with a repeatable seed command.
- Implement the initial local role model as `owner` plus `member`, leaving any moderator tier out of scope for now.

### Unresolved Checkpoints Entering Next Session
- [x] Choose and sign off on the target authentication architecture before schema or route migrations.
- [ ] Define the owner/admin capability model versus public authenticated user capabilities.
- [x] Decide whether reactions are part of the first interaction release or a follow-on phase.

---

## 2026-04-28 — Auth Direction Lock For PR 1

### Decisions Confirmed
- Auth migration target is Auth.js running in the existing Express server.
- Initial OAuth provider set is GitHub plus Google.
- Public profile URL strategy for the migration is `/users/:userId`.
- Reaction scope for v1 is `like` only.
- Account linking will have no self-serve linking UI in v1.
- Initial owner bootstrap policy is manual database promotion after the owner's first successful login.
- The initial capability model is `owner` plus `member`, with no separate moderator role in the first migration.
- Current Clerk-based auth remains the active implementation until later migration PRs replace it.

### Implications Accepted
- Provider account IDs will not become public canonical profile identifiers.
- Authorization must remain local to the app even when authentication is delegated to GitHub or Google.
- A later migration phase must translate existing author references away from Clerk-shaped IDs.

### Remaining Open Question
- Decide later whether the manual bootstrap should remain permanent or be replaced by a seed command once the auth migration is stable.

---

## 2026-04-28 — PR 3 Backend Auth Cutover

### Decisions Confirmed
- Clerk middleware has been removed from the Express API server.
- Auth.js is now the backend authentication substrate and is mounted at `/auth/*`.
- The server now resolves authenticated users from local Auth.js sessions and the local `users` table.
- Post creation and post deletion are owner-only on the server.
- Comment creation is available to authenticated active users, and comment deletion is allowed to the comment author or the owner.

### Accepted Temporary Mismatch
- The backend has been cut over before the frontend auth UI has been migrated off Clerk.
- During this interim state, frontend sign-in flows still need a later PR to use Auth.js instead of Clerk.

### Follow-on Work
- Replace Clerk-based frontend sign-in and session UI with Auth.js-aware frontend flows.
- Update OpenAPI contracts and generated clients once the final auth-facing route behavior is stabilized.

---

## 2026-04-28 — Frontend Auth.js Swap

## 2026-05-04 — Opt-In AI Writing Assistant

### Decisions Confirmed
- AI writing assistance is opt-in and disabled by default; no AI action should appear in the frontend unless the current user has explicitly enabled and configured it.
- Each user may save exactly one active AI vendor and one model slug at a time, plus one encrypted API key stored server-side.
- The persisted backend vendor identifiers are the stable slug set: `mistral`, `opencode-zen`, `opencode-go`, `chatgpt`, `claude`, `google`.
- Human-readable vendor labels are a frontend presentation concern, but the backend now exposes the canonical label mapping so the UI does not need its own divergent source of truth.
- The `model` value is intentionally user-supplied freeform text rather than a server-maintained per-vendor model catalog, to avoid rapid model-list churn becoming a product migration burden.
- Self-hosted or local-gateway AI routing is not permitted for this feature; the AI assistant is hosted-provider-only.
- User-saved AI API keys are encrypted at rest using the app's `AI_SETTINGS_ENCRYPTION_KEY` secret and are never returned from API responses.

### Implementation Notes
- The API now exposes `GET /api/users/me/ai-settings`, `PATCH /api/users/me/ai-settings`, and `POST /api/ai/process`.
- `POST /api/ai/process` accepts only editor content; vendor and model are resolved from the current user's saved AI settings record so the toggle remains the actual authorization gate.
- Editor HTML is converted to plain text with the existing shared HTML-to-text helper before any provider call is made.
- Provider dispatch is now adapter-based, with first-party adapters for Mistral, OpenAI/ChatGPT, Anthropic/Claude, Google Gemini, OpenCode Zen, and OpenCode Go.
- The OpenAPI spec and generated API Zod/client packages were updated so later React UI work can consume the new typed AI settings/process endpoints directly.

### Unresolved Checkpoints Entering Next Session
- [ ] Implement the React settings surface and conditional AI button so the new backend opt-in contract is actually reachable in the frontend.
- [ ] Decide whether disabling AI should merely hide the feature while preserving saved credentials, or also offer a separate "forget my API key" destructive action in the UI.
- [ ] Propose MEMORY.md entries for the new opt-in AI assistant behavior if the human wants them persisted to shared session memory.

## 2026-05-04 — Settings-Gated AI Composer UX

### Decisions Confirmed
- AI configuration now lives on `/settings`, not in the post composer.
- The post composer remains focused on writing; it only exposes an AI action once the owner's AI settings are both enabled and configured.
- Disabling AI hides the composer AI button but preserves the saved vendor, model slug, and encrypted API key so re-enabling can be a simple toggle.
- The model field remains a freeform slug input in the settings UI rather than a server-maintained dropdown catalog.

### Implementation Notes
- The settings page now includes an AI Writing Assistant card backed by the existing `/api/users/me/ai-settings` endpoints.
- The rich post editor now exposes a bottom-right AI button that sends the current editor HTML to `/api/ai/process`, then replaces the editor content with paragraph-wrapped plain text from the response.
- The AI settings UI and editor AI affordance use grayscale surfaces with yellow-border emphasis rather than introducing a new theme system.

### Operational Outcome
- The owner now has a full frontend path to opt into AI assistance intentionally, while the composer stays free of vendor/model controls until that setup is already complete.

## 2026-05-05 — AI Failure Hardening And Vendor Verification Readiness

### Decisions Confirmed
- AI failure handling needed to be hardened before broader vendor testing so the owner could distinguish bad credentials, unsupported models, parse failures, and timeouts without losing draft content.
- Provider failures are now classified explicitly as `timeout`, `upstream_http`, `network`, `parse`, or `unknown_model` instead of being treated as a single generic provider error.
- Local provider timeouts should not masquerade as real upstream `504` responses in logs or UI messaging.
- The owner-facing editor should preserve the draft on any AI failure and show a direct, non-provider-jargon error toast rather than silently failing.

### Implementation Notes
- The provider layer now records transport kind, endpoint family, failure class, retryability, and real upstream status when present, without logging prompt bodies or API keys.
- The React editor was updated to read the generated client `ApiError` shape correctly, rather than assuming an Axios-style `error.response.data`.
- A shared frontend helper now maps AI failures into stable user-facing messages, including an explicit timeout message.
- The AI settings and process routes now send `Cache-Control: no-store, max-age=0` so owner AI configuration is not stranded behind stale `304` responses after contract changes.

### Operational Outcome
- Vendor verification can now use one repeatable runbook because backend logs, route responses, and frontend error handling speak the same failure vocabulary.
- The owner can safely test risky or free-tier models without losing draft content when a provider stalls or rejects the request.

## 2026-05-05 — Owner-Only Multi-Vendor AI Configuration

### Decisions Confirmed
- AI configuration is now owner-administered from `/admin/ai`, not account-scoped from `/settings`.
- The supported hosted-provider set was narrowed to exactly four vendors for this product direction: `kilo-gateway`, `opencode-zen`, `opencode-go`, and `google`.
- Each supported vendor stores one enabled flag, one saved model slug, and one encrypted API key for the owner, with disabled vendors preserving their saved configuration for later reuse.
- The post composer and post edit flows should let the owner choose among configured vendors at rewrite time, while non-owner users should never see AI controls.

### Implementation Notes
- The single-row `user_ai_settings` shape was superseded by `user_ai_vendor_settings`, keyed by `(user_id, vendor)`.
- `POST /api/ai/process` now accepts `{ content, vendor }` and resolves the selected vendor's saved model/key from the owner's Admin configuration.
- `/settings` no longer acts as the source of truth for AI configuration; the owner-facing settings UI moved to `/admin/ai`.
- The editor now exposes an AI vendor dropdown plus the existing `AI` action across compose and post-edit surfaces that already use the shared rich editor.

### Operational Outcome
- The owner can keep multiple low-cost vendors configured at once and switch between them per rewrite without re-entering credentials.
- AI configuration is now clearly treated as site-administration state rather than ordinary account-preference state.

## 2026-05-05 — OpenRouter Replaces Kilo Gateway

### Trigger
- Live testing showed repeated timeout-class failures through `kilo-gateway`, and the human chose to replace that dependency rather than continue debugging it.

### Decisions Confirmed
- `kilo-gateway` was removed from the supported AI vendor contract and replaced everywhere with `openrouter`.
- `openrouter` is now the stable persisted backend slug and `OpenRouter` is the human-readable frontend label.
- OpenRouter should use its official OpenAI-compatible `chat/completions` route rather than a gateway-specific fallback chain.
- OpenRouter model strings are provider-prefixed slugs such as `anthropic/...`, `openai/...`, or `mistral/...`.

### Implementation Notes
- The AI settings allowlist, OpenAPI contract, frontend Admin UI, and vendor verification runbook were updated from `kilo-gateway` to `openrouter`.
- The provider adapter now sends OpenRouter traffic to `POST https://openrouter.ai/api/v1/chat/completions` with Bearer auth.
- Legacy `kilo-gateway` rows in `user_ai_vendor_settings` are not part of the supported runtime shape and should be removed or replaced during operator migration.

### Operational Outcome
- The owner-facing AI vendor set is now `openrouter`, `opencode-zen`, `opencode-go`, and `google`.
- OpenRouter became the low-cost gateway option in the product after Kilo Gateway proved unreliable in live testing.

### Decisions Confirmed
- The web app now uses a single `/sign-in` screen with GitHub and Google OAuth entry points.
- `/sign-up` is retained only as a redirect alias to `/sign-in`.
- Frontend current-user state is now derived from the local `/api/users/me` endpoint and Auth.js-backed cookies.
- Clerk has been removed from the frontend runtime and package dependencies.

### Implementation Notes
- Auth-related frontend requests now rely on cookie-based session transport instead of Clerk client state.
- The compose UI renders from the local role model: only the owner sees post composition, while authenticated users can comment.
- Existing profile routes continue to use `/users/:userId` even though the underlying API contract still has legacy naming that should be cleaned up later.

---

## 2026-04-28 — Identity Contract Cleanup

### Decisions Confirmed
- The OpenAPI and generated client contract now use `userId` instead of `clerkId`.
- The user-posts API route is now documented and implemented as `/posts/user/{userId}`.
- Generated API client and Zod schema packages have been regenerated from the renamed contract so frontend and backend identity terminology now match.

---

## 2026-04-28 — Local Auth Usability Pass

### Decisions Confirmed
- Local development now uses separate frontend and backend ports with the frontend proxying `/api/*` and `/auth/*` to the backend.
- The expected local dev origins are `http://localhost:3000` for the frontend and `http://localhost:8080` for the backend.
- Owner bootstrap remains operator-run, but the repo now includes scripts to list local users and promote one to `owner` after first sign-in.

### Setup Artifacts Added
- `docs/auth-setup.md` documents `.env`, OAuth callback URLs, local dev commands, and owner promotion.
- The example env files now document `FRONTEND_PORT` and `API_ORIGIN` in addition to the Auth.js provider variables.

---

### 2026-05-02 — Engagement CTA Refocus

### Decisions Confirmed
- Replaced the unauthenticated "Sign In to Comment" call-to-action on the Home page with a "Learn More About Me" button.
- The new CTA points directly to the author's public profile at `/users/@cfornesa`.
- The `/sign-up` page was updated to display a "Learn More About Me" button instead of a simple redirect, prioritizing author discovery for new visitors.
- This change aligns with the single-author nature of the platform, focusing visitor engagement on learning about the author rather than immediate account creation.

### Implementation Notes
- Home page hero section now features the "Learn More About Me" button for unauthenticated users.
- Sign Up page provides context about restricted registration and redirects interest to the author profile.

---

### 2026-05-02 — User Profile Customization

### Decisions Confirmed
- Users can now customize their public profile with a custom `username`, `bio`, `website`, and multiple social media links.
- Social links are stored in a single JSON `social_links` column in the `users` table for flexibility and sustainability.
- A new `Settings` page (`/settings`) allows authenticated users to manage these profile details.
- Public profile routes (`/users/:id`) now support fetching by either the internal UUID or a custom `@username` handle.
- The `UserProfile` page was updated to fetch the full user profile data specifically, rather than deriving it solely from post metadata.
- Custom usernames are validated for format (alphanumeric and underscores, 3-30 characters) and uniqueness across the platform.

### Implementation Notes
- Drizzle schema was updated to include `username`, `bio`, `website`, and `socialLinks`.
- OpenAPI specification was expanded with `GET /users/{id}` and `PATCH /users/me` endpoints.
- Backend implemented uniqueness validation for usernames during profile updates.
- Frontend Settings page uses Lucide icons for social platforms and provides real-time validation feedback.
- Profile routing handles the `@` prefix automatically to distinguish between internal IDs and custom handles.
- **Bug Fix:** The `CurrentUser` type in the frontend auth library was updated to include the new profile fields, ensuring they persist and display correctly in the settings interface after a save.

### Unresolved Checkpoints Entering Next Session
- [ ] Decide if post metadata should also include the `authorUsername` to allow for cleaner URLs directly from the feed without extra lookups.
- [ ] Consider if more social platforms (e.g. LinkedIn, Discord) should be added to the default settings form.
- [ ] Monitor if the JSON storage for social links needs a more structured schema (e.g. a specific list of supported keys) as the feature evolves.

---

### 2026-05-02 — Auth.js Path Restoration and Configuration

### Decisions Confirmed
- Reverted the Auth.js mount point to the default **`/api/auth`** to maintain compatibility with existing OAuth provider settings.
- The `basePath` property was removed from the backend configuration to avoid redundancy warnings and allow for a cleaner environment setup.
- **`AUTH_URL`** in the environment must now include the full path to the authentication endpoint (e.g., `http://localhost:3000/api/auth` or `https://chrisfornesa.com/api/auth`) for both local and production environments.

### Implementation Notes
- Backend `ExpressAuth` is now mounted at `/api/auth` in `app.ts`.
- Frontend `authBasePath` was updated to `/api/auth`.
- Redundant `/auth` proxy rule was removed from `vite.config.ts`.
- Documentation in `auth-setup.md` was updated to reflect the full `AUTH_URL` requirement.

---

### 2026-05-02 — Post Expansion and Embed Capabilities

### Decisions Confirmed
- Posts now support an "Expand" action in the feed view, which navigates directly to the post's dedicated detail page.
- "Expand" is represented by a `Maximize` icon and appears on hover for all posts in the feed.
- The site now supports a standalone, frameless embed view for individual posts at `/embed/posts/:id`.
- The embed view renders only the post content, author attribution, and a "View on Microblog" link, without the standard site navigation or layout framing.
- An "Embed" action (represented by a `Code` icon) is now available on hover for all posts.
- Clicking the "Embed" button copies a pre-configured `<iframe>` code snippet to the user's clipboard for easy syndication.

### Implementation Notes
- `App.tsx` layout was refactored to conditionally render the `Navbar` and site shell based on whether the current route is an embed path.
- A new `PostEmbed` page component was created to handle the frameless rendering logic.
- `PostCard` was updated with hover actions for "Maximize" and "Code" buttons, using the existing styling pattern established for owner-only actions (Edit/Delete).
- The embed logic uses `navigator.clipboard` to provide a seamless copy-paste experience for the iframe snippet.

### Unresolved Checkpoints Entering Next Session
- [ ] Monitor if the `iframe` default height (400px) in the copied snippet is sufficient for most rich posts or if it should be more dynamic.
- [ ] Decide if the embed view should support any interactive elements like reactions or if it should remain a static content view.

---

### 2026-05-02 — Native Sharing and Dynamic Social Previews

### Decisions Confirmed
- Added a "Share" button to posts that utilizes a custom **Share Modal Dialog** for direct social media intents (X, Bluesky, LinkedIn, Facebook, SMS).
- The "Share" button and "Embed" button now utilize **responsive icon-only layouts** on mobile devices to prevent horizontal UI crowding.
- Implemented server-side Open Graph (OG) meta tag injection for all post and embed routes to ensure rich link previews on social platforms.
- Adopted dynamic image generation for post social previews using `satori` and `@resvg/resvg-js` to render a visual card of the post content in the site's "Brutalist Bauhaus" style.
- Externalized `@resvg/resvg-js` in the backend `esbuild` configuration to avoid bundling issues with its native `.node` addons.

### Implementation Notes
- The `api-server` now intercepts `GET /posts/:id` and `/embed/posts/:id` to inject metadata into the raw HTML before serving it.
- A new endpoint `GET /api/og/posts/:id` serves a dynamically generated PNG image for the `og:image` tag.
- Backend fonts (`Space Grotesk Bold`, `Inter Regular`) are stored in `artifacts/api-server/assets/fonts` and resolved relative to the `src/lib` directory.
- Fixed a TypeScript build error in the `users` route where `req.params.id` was improperly typed.
- The `SharePostDialog` component handles HTML stripping and platform-specific web intent URL generation.


### Unresolved Checkpoints Entering Next Session
- [ ] Verify the performance impact of dynamic image generation under load and consider a more aggressive CDN caching strategy if needed.
- [ ] Decide if author profile pages should also have dynamic OG previews similar to individual posts.

---

### 2026-05-02 — Site Themes & Palettes (9 × 9 + custom overrides)

### Decisions Confirmed
- Owner-only Site Customization now has three independent dimensions instead of one: a **theme** controlling structure (borders, shadows, fonts, weights, radius, heading transform), a **palette** controlling the 14 HSL color values, and per-field color overrides on top of either.
- The catalog shipped with 9 themes (`bauhaus` (default), `traditional`, `minimalist`, `academic`, `airy`, `nature`, `comfort`, `audacious`, `artistic`) and 9 palettes (`bauhaus` (default), `monochrome`, `newsprint`, `ocean`, `forest`, `sunset`, `sepia`, `high-contrast`, `pastel`).
- Switching palette uses **smart-merge**: only color fields that still match the previously-active palette get replaced; any field the owner has hand-edited survives the swap.
- Theme + palette IDs are **enum-validated at the API boundary** (OpenAPI enum → generated Zod schema → server-side `safeParse`), so unknown IDs cannot be persisted.
- Bauhaus remains the canonical default and the "Reset to defaults" button restores it across all three dimensions.
- The brutalist `!important` global overrides were removed from `index.css`; structural styling now lives in `--app-*` CSS variables driven by `[data-theme="..."]` rules. The button-element rules were re-qualified with `[data-theme]` to maintain enough specificity to beat single-class Tailwind v4 utilities (`border`, `rounded-md`).
- Google Fonts (Lora, EB Garamond, Inter, Nunito, Quicksand, Space Grotesk, Bebas Neue, Caveat) are now loaded site-wide because the non-Bauhaus themes need them. This is the first design choice that *intentionally* lets the site present in non-Bauhaus typography.

### Implementation Notes
- DB schema: added `theme` and `palette` `varchar(32) NOT NULL DEFAULT 'bauhaus'` columns to `site_settings`. Drizzle schema, runtime `ensureColumn` migration, OpenAPI, generated client, and the hand-applied `lib/db/site_settings_install.sql` script were all updated together. The install script uses idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN IF NOT EXISTS` + `INSERT IGNORE` so it stays safe to re-run.
- Frontend catalog lives in `artifacts/microblog/src/lib/site-themes.ts` (single source of truth for THEMES, PALETTES, PALETTE_COLOR_KEYS, getPalette/getTheme, smartMergePalette).
- `<ThemeInjector />` now sets `document.documentElement.dataset.theme` from settings and falls back to `bauhaus` if the value is unknown.
- The settings card shows tile pickers (description + 7-color swatch row), a live palette preview, and the per-field color editor underneath. `lastPaletteRef` (a `useRef`) tracks which palette the form was last merged from so smart-merge has a known baseline.

### Pre-existing Issues Surfaced (not addressed in this session)
- First-paint flash of the Bauhaus default styling before the client fetches `/api/site-settings` and applies the owner's chosen theme/palette. Most visible when the active theme is non-Bauhaus. Captured as a follow-up task.
- Picker tiles on the customization page inherit theme button styling, which means in heavy themes (Audacious / Bauhaus) the picker tiles get chunky 4–6px borders and brutal hover transforms. This reads on-theme but may be too aggressive for picker UI specifically.

### Unresolved Checkpoints Entering Next Session
- [x] Decide whether the visual identity contract has changed — i.e. whether DESIGN.md "Declared Preferences" should now describe a Bauhaus *default* with optional alternates, rather than Bauhaus as the only acceptable look. **Confirmed 2026-05-02:** Bauhaus remains the *default* identity; the alternate themes are owner-chosen exceptions. Captured in DESIGN.md Observed Taste (2026-05-02 DIRECTION + TENSION entries).
- [x] Decide whether to stop the first-paint flash via server-rendered initial state (would require API server to inject a `<style>` block or `data-theme` attr into index.html before React mounts). **Done 2026-05-02:** API server now injects `data-theme` on `<html>` and a `<style id="site-settings-theme">` block into every HTML response before React mounts. `ThemeInjector` is idempotent — it only updates the style/attribute if the value has changed, so there is no re-flash on hydration.
- [ ] Decide whether the picker tiles in `SiteCustomizationCard` should opt out of the theme button styling so they read more like a static gallery and less like 18 chunky brutal buttons.

---

### 2026-05-02 — AGENTS.md Self-Eval Amendments

### Trigger
Self-evaluation against `EVAL_PROMPT.md` after the themes & palettes
session surfaced four concrete framework gaps. Each amendment below
addresses an actual failure observed in that session, not a hypothetical.

### Decisions Confirmed
- The AGENTS.md Safeguard requirement of "explicit human instruction" was
  met for these edits (user message: *"You are explicitly allowed to
  implement them in both DESIGN.md and AGENTS.md"*).
- Four amendments to AGENTS.md were applied:
  1. **Mode table → Auto Build row** clarified to state that Rules 1–4
     still apply at every checkpoint, that Auto Build only relaxes
     mid-execution chatter once the question has been answered, and that
     before any "task complete" tool call the agent must propose
     MEMORY.md + DESIGN.md Observed Taste entries (or log an unresolved
     checkpoint here). The row now also names "Replit Agent autonomous
     loops" so the rule unambiguously applies to this runtime.
  2. **Pre-Write Check** gained a fourth bullet covering string enums
     persisted in the database or contracted in OpenAPI (theme IDs,
     palette IDs, role names, content-format tags). These are now
     explicitly Irreversible Decisions requiring sign-off on the value
     list before the first write.
  3. **New Vendor Dependency** rule gained an explicit "What counts"
     list covering CDN `<link>`/`<script>` tags, third-party fonts,
     webhooks, OAuth providers, and self-hosted-to-hosted swaps. The
     missing trigger this session was the Google Fonts addition to
     `index.html`, which the previous prose did not unambiguously cover.
  4. **DESIGN.md Observed Taste** entries from 2026-05-02 had their
     PROPOSED markers removed and were confirmed: Bauhaus is now the
     *default* identity, not the only acceptable look; the project now
     navigates a real tension between brand discipline and self-publishing
     autonomy.

### Implementation Notes
- No prose was changed in the Six Rules block, the Brainstorm Mode block,
  the Core Constraints block, the Skills table, the Memory Files table,
  or the Safeguard block. Edits were strictly additive plus the Mode
  table row rewrite.
- The end-of-session "propose MEMORY + Observed Taste" obligation
  previously lived only in the Memory Files prose ("End of session
  (interactive mode): …"), which Auto Build runtimes systematically
  skipped because `mark_task_complete` is not perceived as "end of
  session." It now lives in the Mode table row itself, on the row that
  most often skipped it.

### Outcome
- AGENTS.md is now self-consistent for autonomous-build runtimes; the
  rules that were nominally binding but procedurally invisible are now
  procedurally visible at the moments they need to fire.
- DESIGN.md Declared Preferences remain unchanged. They now describe the
  *default* identity rather than an absolute prohibition; the Observed
  Taste section carries that nuance explicitly.

### Unresolved Checkpoints Entering Next Session
- [ ] Decide whether DESIGN.md Declared Preferences itself should be
  rewritten to describe the Bauhaus identity as a "default" in its own
  prose, or whether keeping Declared Preferences strict + relying on
  Observed Taste for the nuance is the preferred form.

---

### 2026-05-02 — Post-Merge Schema Sync Removed (Option A)

### Trigger
Post-merge setup failed twice in a row (Tasks #3 and #4 merges) because
`drizzle-kit push` hung on the shared Hostinger MySQL host's schema-pull
step. The schema-pull introspects every table in the database — including
neighbor tenants on the shared host — and consistently exceeded the 20s
default timeout. Bumping to 90s did not help; the command still hung past
60s when run directly.

### Decision Confirmed
- Removed `drizzle-kit push` from `scripts/post-merge.sh`. The post-merge
  script now does only `npm ci`.
- Designated the API server's runtime `ensureTables()` + `ensureColumn()`
  path (in `artifacts/api-server/src/lib/db`) as the single source of
  truth for schema reconciliation in this project.
- Rationale: the API server restarts immediately after every task merge
  and runs the runtime migration on startup, so schema changes already
  ship at that moment. The drizzle-kit push step was redundant in the
  normal merge flow and was actively blocking merges by timing out.
- For one-shot pushes outside the normal merge flow (e.g. before a
  deploy that bypasses the API server startup path), the script's
  comment block documents the manual command:
  `npm run push-force --workspace=@workspace/db`.

### Options Considered
- **A. Drop drizzle-kit push** — chosen. Simplest, matches what already
  ships, near-zero practical risk because the runtime path runs
  immediately after every merge.
- **B. Wrap push in `timeout 60s`** — rejected; would still cause periodic
  failures without catching anything the runtime path doesn't handle.
- **C. Replace push with direct `mysql < lib/db/site_settings_install.sql`**
  — rejected; only covers `site_settings`, would silently miss other
  table changes, not viable as a general-purpose answer.

### Verification
- `runPostMergeSetup()` now completes in 14.4s (was timing out at 20s,
  then failing at 22s after the 90s bump).
- API server is currently running and serving requests against the same
  MySQL host without any manual push step, confirming the runtime
  migration is sufficient.

### Outcome
- Post-merge setup is now reliable and fast.
- Schema migration responsibility is consolidated in one place (runtime
  startup) rather than split between runtime and post-merge.
- Post-merge timeout configured at 90s in `.replit` is now generous
  headroom rather than a tight deadline; left in place to absorb
  occasional `npm ci` variability without re-tuning.

### Unresolved Checkpoints Entering Next Session
- [ ] If a future schema change is non-additive (column drop, type
  narrowing, table rename) the runtime `ensureColumn()` path will not
  catch it — at that point reconsider whether to add a manual push step
  to a *deploy* script (not the post-merge script) or build a proper
  drizzle migration runner.
  - **Partial resolution 2026-05-02**: Task #9 needed a new foreign key
    constraint added to `posts` after the column already existed on
    pre-existing deploys. Resolved by extending the runtime path with
    `ensureForeignKey()` in `lib/db/src/migrate.ts`, which adds the
    constraint if and only if it doesn't already exist. The runtime
    path now handles columns, foreign keys, and indexes (via
    `ensureIndex()` added by Task #13). True non-additive changes
    (drops, type narrowings, renames) still need a different
    mechanism but no such change has been needed yet.

---

### 2026-05-02 — Per-User Profile Theming (Task #5)

### Trigger
Task #5 needed each signed-in user to be able to theme their own
profile page (`/users/@handle`) using the same surface area as
site-wide owner customization, without bleeding into the navbar or
footer or interfering with the existing site customization rules.

### Decision Confirmed
- **Schema choice**: 16 nullable columns directly on the `users`
  table (`theme`, `palette`, and 14 HSL color fields), mirroring
  `site_settings`. Rejected alternatives: a separate `user_themes`
  table (extra join on every profile page render for no real
  isolation benefit), or a single JSON column (loses field-level
  null-as-clear semantics and SQL-level enum validation).
- **NULL-as-clear semantics**: `NULL` on a column means "use the
  site default for that field." `PATCH /api/users/me` distinguishes
  "key absent" (preserve current value) from "explicit null"
  (clear), so a profile-info save never wipes a user's theme.
- **No-flash first paint**: server-side injection of both a scoped
  `<style>` block AND a synchronized `window.__USER_THEME_BOOTSTRAP__`
  script. The script-and-style pair is the contract — neither alone
  is sufficient. `<UserThemeScope>` reads the bootstrap synchronously
  on first render via `useMemo`, so the wrapper exists with the
  right attributes from frame 1.

### Verification
- 59 tests across api-server and microblog cover the contract,
  including XSS-via-color-string rejection (strict HSL regex on both
  server and client), bootstrap script body escaping, and scope-key
  whitelisting.
- End-to-end verified against a real user via curl during the merge.

### Outcome
- The user's per-page theme applies only to their profile content;
  navbar and footer keep the site owner's theme.
- Imported feed posts (which have `author_user_id = NULL`) cleanly
  fall back to the site default theme without special-casing.

---

### 2026-05-02 — Persisted DB Enum: posts.status (Task #9)

### Trigger
Per the AGENTS.md amendment shipped this session, persisted DB string
enums are Irreversible Decisions and must have their value set
explicitly logged before a column is added. Task #9 added
`posts.status` and the values shipped need to be on the record.

### Decision Confirmed
The full set of values shipped by Task #9 for `posts.status`:
- `published` — visible on the public timeline. Default for all
  existing rows (so legacy posts continue to be public) and for any
  post created through the existing hand-written-post code path.
- `pending` — only visible to the owner in the moderation queue.
  Default for posts inserted by the feed ingest path.

### Options Considered for the Initial Set
- Adding a `rejected` value was considered and rejected. Reject
  deletes the post but keeps the GUID in `feed_items_seen` so the
  same item cannot re-import. A `rejected` row would be a tombstone
  with no readers and no use case.
- Adding a `scheduled` value (for future-publish) was considered
  and rejected as out of scope for Task #9. Approve = publish now.

### Outcome
The values `published` and `pending` are the full set shipped by
Task #9. Adding any third value (e.g. `rejected`, `scheduled`,
`draft`) is itself an Irreversible Decision per AGENTS.md and would
need its own DECISIONS.md entry plus explicit human confirmation.

---

### 2026-05-02 — New Vendor Dependency: rss-parser (Task #9)

### Trigger
Per the AGENTS.md New Vendor Dependency rule, third-party packages
that interpret untrusted input from external services must be
explicitly logged.

### Decision Confirmed
Added `rss-parser` to `@workspace/api-server` as the RSS 2.0 / Atom
1.0 / JSON Feed parser for the inbound feed ingest pipeline. Small,
no native deps, the most common Node choice for this exact job.
Sanitization of the parsed body still happens through the project's
own `sanitizeRichHtml` helper, so the trust boundary remains in
project code; `rss-parser` is responsible only for XML parsing.

### Outcome
- Added at install time of Task #9.
- `User-Agent` header for outbound fetches is set to a neutral
  `MicroblogFeedIngest/1.0` so feed publishers can identify the
  traffic source without leaking deployment details.

---

### 2026-05-02 — PESOS Architecture: Post-First, Dedup-Second Ordering (Task #9)

### Trigger
Inbound feed ingest needed dedup that is correct under both retry
(transient post-insert failure) and concurrent refresh (two HTTP
calls to `/api/feed-sources/refresh` racing on the same source).

### Decision Confirmed
- **Ordering rule**: in `ingestOneItem`, the post row is written
  first, then the `(source_id, guid_hash)` ledger row is inserted
  with `post_id` already populated. If the post insert fails for any
  reason (validation, transient DB error), the ledger is never
  touched — the item stays retriable on the next refresh.
- **Race recovery**: the unique key on `(source_id, guid_hash)` is
  the race-safety net. Two concurrent refreshes can both pass the
  cheap `isAlreadySeen` check and both insert posts; the second
  `insertDedupRow` throws `ER_DUP_ENTRY` (mysql errno 1062) and the
  loser's post is removed by a compensating `deletePost`, leaving
  exactly one row on the timeline.
- **Testability**: per-item logic is decoupled from Drizzle behind
  the `IngestDb` contract so the ordering rule is unit-tested with
  stubs (no MySQL).

### Options Considered
- **Dedup-first, post-second**: rejected because a post-insert
  failure would leave a permanent ledger entry blocking the item
  from ever importing on a later retry.
- **Single transaction wrapping both**: rejected because MySQL's
  `ER_DUP_ENTRY` inside a transaction would still need explicit
  rollback handling, the race window doesn't shrink, and the
  ordering rule is the actual invariant — transactions don't add
  safety beyond it.

### Verification
- 9 unit tests cover happy path, already-seen short-circuit,
  dedup-not-written on post failure, retry on transient post
  failure, ER_DUP_ENTRY race compensation, and non-duplicate error
  pass-through.

---

### 2026-05-02 — Search Architecture: Native MySQL FULLTEXT (Task #13)

### Trigger
Task #13 needed a search backend. Three real options were considered
during planning: native MySQL FULLTEXT, a JS-side in-memory index
(MiniSearch / Lunr), or an external search service (Algolia,
Meilisearch, Typesense). The user accepted the recommendation but
the architectural reasoning needs to be on the record.

### Decision Confirmed
Native InnoDB FULLTEXT index on a new `posts.content_text` shadow
column. The shadow column is populated by the shared
`computeContentText` helper from `posts.content` on every insert
and update, so the index can never drift from the rendered post
body. Legacy rows are backfilled in app code via
`backfillPostContentText` invoked from `index.ts` after
`ensureTables` — using the same JS stripper as inserts, not a SQL
approximation, so historical and new rows are stripped identically.

### Options Considered
- **JS-side index (MiniSearch / Lunr)**: would have given fuzzy /
  edit-distance matching, but introduces a second store that needs
  to be rebuilt on API restart and kept in sync on every write.
  Worse fit for the single-instance API + MySQL combo.
- **External search service**: overkill at single-author microblog
  scale, adds a vendor dependency and recurring cost for no real
  capability gain over FULLTEXT at this scale.

### Outcome
- Zero new infrastructure, zero new vendor dependencies for search.
- Index lives next to the data — no second store to keep in sync.
- Built-in relevance scoring via `MATCH() AGAINST() ORDER BY
  score`. Boolean-mode operators available for free.
- Performance is sub-200ms at the steady-state size of this site.
- Reusable `ensureIndex()` helper added to `lib/db/src/migrate.ts`
  for future tasks that need additional indexes (FULLTEXT, BTREE,
  UNIQUE).

### Decision: Search visibility for the owner
- The `WHERE status = 'published'` predicate is applied
  unconditionally inside the search endpoint, not as an opt-in flag
  the client could omit. Search is semantically identical to "what
  is publicly visible" even for the owner — the user explicitly
  chose this option ("option B") during the planning phase. Pending
  feed-imports are reachable only through the dedicated pending-
  review queue from Task #9, never through search.

### Decision: Public source list endpoint
- A new `GET /api/feed-sources/public` was added so visitors can use
  the source filter on the search page. It returns only `id` and
  `name` for sources that have at least one published post — no
  URLs, no cadence, no error state. The owner-only
  `/api/feed-sources` endpoint still exposes the full row to the
  owner, so this is a deliberately narrowed projection rather than
  a change to the existing endpoint.

---

## 2026-05-09 — P5 Piece Embed Architecture (Option C: Server-Rendered Standalone Page)

### Trigger
After pieces could be saved and inserted into posts via the library
dialog, the iframe embed disappeared immediately when the post was
published. The sanitizer was stripping `http://localhost` iframe srcs
because `"src"` was listed in `allowedSchemesAppliedToAttributes`,
which applied the HTTPS-only scheme check before `exclusiveFilter`
(which already allowed localhost) could evaluate the src.

### Decision Confirmed
Option C: server-rendered standalone embed page at
`GET /embed/pieces/:id`. Express route returns a minimal, self-
contained HTML document — p5.min.js + sketch code inline, no React
SPA, no extra round-trips. Mirrors the already-working post embed
(`GET /embed/posts/:id`) architecture exactly.

### Options Considered
- **Option A — fix allowedSchemes in the sanitizer only**: would have
  worked for localhost dev but continued to require `https:` in
  production. Fragile: any future origin change would break embeds.
- **Option B — URL rewriting to an absolute https: URL**: bakes the
  origin into stored content; breaks if the domain changes.
- **Option C — server-rendered standalone embed page** *(chosen)*:
  zero browser JS dependency in the embed frame, stable at any origin,
  identical to the post embed pattern that already worked.

### Files Changed
- `artifacts/api-server/src/routes/piece-embed-html.ts` — new file;
  Express router for `GET /embed/pieces/:id` + `?version=` query param.
  Serves inline p5.min.js sketch via `JSON.stringify(code)` to safely
  embed the sketch as a JS string literal.
- `artifacts/api-server/src/app.ts` — registered
  `/assets/p5.min.js` static route (from workspace `node_modules/p5`)
  and mounted `pieceEmbedHtmlRouter`.
- `artifacts/api-server/src/lib/html.ts` — removed `"src"` from
  `allowedSchemesAppliedToAttributes`; added `/embed/pieces/` prefix
  check to `isAllowedIframeSource` for root-relative URLs.
- `artifacts/microblog/src/components/post/RichPostEditor.tsx` —
  changed iframe src from absolute (`window.location.origin + ...`) to
  root-relative (`/embed/pieces/${id}?version=...`) so it resolves
  against the page origin in both dev and production.

### Outcome
- Piece iframes survive the HTML sanitizer in all environments.
- p5.min.js is served self-hosted from workspace node_modules — no CDN
  dependency, no new vendor entry needed in docs/dependencies.md.

---

## 2026-05-09 — React Iframe Stability (Three-Layer Fix)

### Trigger
Server logs showed `/embed/pieces/:id` being requested repeatedly
every 20–30 seconds, and the same behavior affected external iframe
embeds (e.g. YouTube). Root cause: React Query's default
`staleTime: 0` + `refetchOnWindowFocus: true` triggered frequent
refetches; each refetch produced new JS object references for posts,
which cascaded through PostCard state and caused PostContent to reset
its innerHTML, restarting all iframes.

### Decision
Three-layer fix applied in parallel:

1. **QueryClient defaults** (`App.tsx`): `staleTime: 60_000` (data
   fresh for 1 minute, no background refetch within that window) +
   `refetchOnWindowFocus: false` (eliminates tab-focus refetches, the
   most common trigger during normal use).

2. **`React.memo` on PostContent** (`PostContent.tsx`): All four props
   (`content`, `contentFormat`, `className`, `highlightQuery`) are
   primitives — shallow comparison equals value comparison. PostContent
   will not re-render unless those strings actually change.

3. **Functional state update in PostCard** (`PostCard.tsx`): The
   `displayPost` sync effect was changed from `setDisplayPost(post)` to
   a functional updater that returns `prev` unchanged when `id`,
   `content`, and `contentFormat` are identical. Same reference →
   React bails out → PostContent is never re-rendered → iframes never
   reload. The optimistic-update path (onSuccess calling setDisplayPost
   directly) is unaffected.

### Outcome
- Piece embeds and external iframes load exactly once per navigation.
- Tab switching and background fetches (after the 60s stale window)
  no longer restart embedded content.
- Optimistic post editing still works correctly.

---

## 2026-05-09 — Art Piece Delete Endpoint and Admin UI

### Trigger
The Pieces admin panel had no way to remove pieces once created.

### Decision
Full-stack delete: OpenAPI spec → orval codegen → Express route →
admin UI Trash icon.

### Files Changed
- `lib/api-spec/openapi.yaml` — added `DELETE /art-pieces/{id}`
  operation (`deleteArtPiece`, 204/401/403/404). Treated as a new
  irreversible API contract; the endpoint returns 404 for pieces the
  caller does not own, never 403, to avoid ownership enumeration.
- `artifacts/api-server/src/routes/art-pieces.ts` — added
  `router.delete("/art-pieces/:id", requireAuth, requireOwner, ...)`.
  Cascades to `art_piece_versions` via the `ON DELETE CASCADE` FK
  already in the schema. Validates ownership at the row level in
  addition to the middleware check.
- `lib/api-client-react/src/generated/api.ts` and
  `lib/api-zod/src/generated/api.ts` — regenerated via
  `cd lib/api-spec && npm run codegen`; `useDeleteArtPiece` hook
  is now available.
- `artifacts/microblog/src/pages/admin/admin-pieces.tsx` — added
  `useDeleteArtPiece` mutation with `window.confirm` guard. Piece
  list items wrapped in `<div class="group relative">` so the Trash2
  icon (`opacity-0`, `group-hover:opacity-100`) appears on hover;
  `e.stopPropagation()` prevents the trash click from selecting the
  piece. Clears `selectedId` if the deleted piece was selected.

### Outcome
- Pieces can be permanently deleted from the admin UI with a single
  hover-reveal Trash button and a confirmation dialog.
- Deletion cascades — no orphaned version rows.

---

## 2026-05-10 — Feed Source Profile Pages

### Trigger
Feed-imported posts use `posts.author_id = "feed:N"`. Clicking an author
name on any such post navigated to `/users/feed:1`, but `GET /users/:id`
only queried the `users` table and returned 404 → "USER NOT FOUND".

### Decisions Confirmed
- `feed_sources` gains two additive nullable columns: `username VARCHAR(100) NULL`
  and `bio TEXT NULL`. Provisioned via `ensureColumn` in `lib/db/src/migrate.ts`.
- `feed_sources.username` creates a friendly profile URL at `/users/@handle`.
  Uniqueness is enforced at the application layer across both `users` and
  `feed_sources`; there is no DB-level cross-table unique constraint.
- `GET /users/:id` now dispatches on three ID shapes:
  - `feed:N` → queries `feed_sources` by numeric ID.
  - UUID → queries `users` by ID (existing path, unchanged).
  - Any other slug → checks `feed_sources.username` first, then `users.username`.
  Feed profiles return `sourceType: "feed"` and `siteUrl` in the response so the
  frontend can distinguish them from human user profiles.
- `PATCH /feed-sources/:id` now accepts `username` and `bio`. Before saving a
  username the route validates uniqueness against both `users.username` and
  `feed_sources.username` (excluding the current row).
- `POST /feed-sources` (create) now accepts `bio` so a bio can be set at
  subscription time without a separate edit step.
- The `UserProfile` frontend page branches on `sourceType === "feed"`: shows an
  "Automated feed" badge next to the source name, renders `siteUrl` as a
  clickable external link (Globe icon), and loads posts via
  `useListPosts({ source: N })` using the existing `?source=` filter rather than
  `useGetPostsByUser`. The empty-state message is contextual.
- The `/admin/feeds` inline edit panel gained Username and Bio fields. When a
  username is saved the source card shows a clickable `@handle → profile page`
  link. The "Add a source" form also exposes a Bio textarea.
- OpenAPI spec and orval codegen updated: `FeedSource` and `UpdateFeedSourceBody`
  gain `username` and `bio`; `CreateFeedSourceBody` gains `bio`; `UserProfile`
  gains optional `sourceType` and `siteUrl` fields.

### Outcome
- Visiting `/users/feed:1` or `/users/@myblog` now renders a feed source profile
  showing the blog name, optional bio, site URL as a link, post count, and a
  live list of the source's published imported posts.
- Human user `@handle` routes continue to resolve without regression.
- Existing `feed:N` numeric URLs remain stable; `@handle` URLs are additive.
- No user records are created for feed sources; the distinction between automated
  feed profiles and human user profiles is expressed via `sourceType`.

## 2026-05-10 — Art Piece Rendering Overhaul & Editable Source Code

### Trigger
Pieces could only be saved via JSON specifications that restricted manual editing and frequently resulted in validation errors due to AI output inconsistencies. The user requested explicitly editable code tabs (HTML, CSS, JS) for pieces and a refactored AI generation process to inject boilerplate code instead of relying on pure JSON specifications. Initial attempts to fix this via software Proxies and `new Function` evaluation proved brittle, leading to "code is not defined" and "illegal invocation" errors, and Three.js pieces frequently rendered as blank screens due to missing camera framing or unserved library chunks.

### Decisions Confirmed

**Systemic Rendering Overhaul:**
- Replaced the brittle Proxy-based evaluation with native browser execution inside a sandboxed `<iframe>`. The `ArtPieceRenderer` now uses `iframe srcdoc` for previews, ensuring the Admin preview behaves exactly like the live site.
- Removed all `mockWindow` and `robustEval` logic. AI-generated code now runs natively in the global scope of the iframe, protected by the `sandbox="allow-scripts allow-same-origin"` attribute.
- Updated `app.ts` to serve entire library directories (`p5`, `three`, `c2.js`) via `express.static` under `/runtimes`. This allows modular libraries like Three.js to lazily load their own chunks (e.g., `three.core.min.js`), resolving `404` errors.
- Added a global `window.onerror` listener inside all pieces to provide clear, visible error overlays for debugging.

**AI Generation & Schema Updates:**
- Added `html_code` and `css_code` to `art_piece_versions` table and made `structured_spec` nullable to allow storing explicit source code per version.
- Replaced JSON schema constraints in the generation pipeline with Markdown code block extraction (```html, ```css, ```javascript).
- Modified AI system prompts to provide boilerplate code templates and enforced a **mandatory three-block return** requirement.
- Added explicit **infinite animation requirements** to prompts (using `Math.sin/cos` and `frameCount`) to prevent pieces from ending on a blank screen.
- Enhanced the generation retry logic to pass failed code blocks back to the AI for iterative repairs (up to 5 attempts, with a 120s timeout limit).

**Admin UI & UX Refinements:**
- The Admin UI (`/admin/pieces`) now includes separate tabs for Metadata, HTML, CSS, and JS.
- Preview rendering now uses live textarea states, allowing for real-time testing of manual edits before saving.
- For existing pieces with `null` code, the UI automatically populates textareas by extracting original background colors from the `structuredSpec` and applying engine-specific fallback templates.
- Constrained all art-piece related dialogs (Library, Draft, Generation) to `90vh` and `90vw` with `overflow-y-auto` to ensure they always fit the screen and remain accessible.
- Removed version pinning from embed URLs (`/embed/pieces/${id}`) so that edits made in the Admin console are instantly reflected in all posts using that piece.

**Three.js Auto-Fit:**
- Implemented a robust `autoFit` logic in both the preview and embed templates. It instruments the `Scene` and `PerspectiveCamera` to track all objects (including `Points` and `Lines`) and uses `Box3.setFromObject(scene)` at frame 15 to automatically frame the camera, regardless of AI-generated camera positions.

### Outcome
- AI iteration is robust, uses previous attempts as material, and generates continuously engaging looping animations.
- The user can natively edit and store JS, HTML, and CSS directly in the Admin console with real-time previewing.
- Three.js pieces render reliably across all posts with automatic camera framing and full library support.

---

## 2026-05-11 — Home Feed Auto-Update (React Query Invalidation)

### Trigger
Posting new content, updating posts, or approving items from the review queue did not automatically update the main home feed. Visitors and owners were forced to manually refresh the browser to see their changes.

### Decisions Confirmed
The home feed utilizes a custom `useInfiniteQuery` with a specific internal key (`"listPosts"`). This key was not being targeted by existing mutations.
- Updated `ComposePost.tsx`, `PostCard.tsx`, `admin-feeds.tsx`, and `admin-pending.tsx` to explicitly call `queryClient.invalidateQueries({ queryKey: ["listPosts"] })` during the `onSuccess` phase of create, update, delete, and approval mutations.
- This ensures that any action that modifies the public timeline triggers an immediate, seamless background refetch for the home page feed.

### Outcome
- The main feed now updates automatically in real-time as content is created or modified, providing a much more intuitive and reactive user experience.
