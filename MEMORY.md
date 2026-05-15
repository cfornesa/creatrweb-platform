<!-- Agent reads this file at every session start. Surface any entry marked PENDING CONFIRMATION
to the human before proceeding. Do not act on a pending entry — wait for explicit confirmation
or rejection. -->

2026-04-28 · PRODUCT · The project direction is an author-owned microblog where only the site owner publishes canonical posts, while signed-in visitors can comment and react.
    [Verified from CONSTRAINTS.md and DECISIONS.md.]

2026-04-28 · AUTH · The repo direction is a migration away from Clerk toward Auth.js with GitHub and Google as the initial OAuth providers.
    [Verified from DECISIONS.md, docs/auth-setup.md, and untracked auth migration files.]

2026-04-28 · ROLES · The initial local capability model is `owner` plus `member`, with owner bootstrap handled by manual promotion after the owner's first successful login.
    [Verified from CONSTRAINTS.md and docs/auth-setup.md.]

2026-04-28 · DEV SETUP · Current local development uses root `npm run dev` as the standard one-port workflow at `http://localhost:4000`; `npm run dev:hot` is the two-port Vite hot-reload workflow with the frontend at `http://localhost:3000` proxying API/Auth routes to the API server on `PORT`.
    [Updated 2026-05-15 from docs/auth-setup.md, README.md, replit.md, and package scripts.]

2026-04-28 · STACK · The current repo is an npm workspaces TypeScript monorepo with an Express 5 API, a React 19 + Vite frontend, and MySQL via Drizzle ORM.
    [Verified from package.json and DECISIONS.md.]

2026-04-29 · RECOVERY NOTE · Shared memory was repopulated from repo evidence after discovering that MEMORY.md had not been filled in, while DECISIONS.md and CONSTRAINTS.md already contained substantial project history.
    [Verified from the current repository state, docs, and recent git history on 2026-04-29.]

2026-04-29 · AUTHORING · Owner-authored posts now support rich editing with sanitized HTML storage, local image uploads, and owner-trusted `https:` iframe embeds, while legacy plain-text posts still remain renderable.
    [Verified from DECISIONS.md, docs/dependencies.md, and the current post editor/backend route structure.]

2026-04-29 · EMBEDS · The owner is now the trust boundary for iframe embeds, so rich posts may render any `https:` iframe source rather than a server-maintained host allowlist.
    [Verified from DECISIONS.md and the current sanitizer behavior.]

2026-04-29 · COMMENTS · Signed-in users can edit their own plain-text comments inline, while post publishing remains owner-only.
    [Verified from DECISIONS.md, CONSTRAINTS.md, and the current frontend/backend comment flow.]

2026-05-06 · FEEDS · Primary feed URLs are under `/api` so Replit's webview proxy forwards them to Express: `GET /api/feeds/atom` (Atom), `GET /api/feeds/json` (JSON Feed 1.1), `GET /api/feeds/mf2` (mf2-JSON). Per-category: `GET /api/categories/:slug/feeds/atom` and `/api/categories/:slug/feeds/json`. Per-page: `GET /api/p/:slug/feeds/atom` and `/api/p/:slug/feeds/json`. Backward-compatible aliases (`/feed.xml`, `/feed.json`, `/atom`, `/jsonfeed`, `/export/json`, etc.) are kept in `feeds.ts` and remain functional via direct Express access.
    [Updated 2026-05-06; moved feed content routes into `feeds-catalog.ts` under `/api` to bypass Replit proxy limitation (proxy only forwards `/api/*`).]

2026-05-06 · FEEDS CATALOG · The feeds catalog (`GET /api/feeds`) always returns all category feeds — no `?category` param needed. Adding or deleting a category is reflected on the next request with no deploy. The `/feeds` page groups feeds into sections: "Site Feeds" for the three standard formats, one section per category (alphabetical), and optionally a per-page section via `?page=<slug>`. Feed URL generation is host-agnostic: origin is derived from `x-forwarded-proto`/`x-forwarded-host` (set by Replit's proxy for custom domains) or the raw Express `req.protocol`/`req.get("host")` for local. `PUBLIC_SITE_URL` is NOT used for feed URL generation. Catalog paths now use `/api/feeds/atom`, `/api/feeds/json`, `/api/feeds/mf2`, etc.
    [Updated 2026-05-06 to reflect `/api`-prefixed primary URLs in feeds-catalog.ts.]

2026-05-06 · HOMEPAGE UX · The home feed has four browsing controls: Sort, Filter (has-comments / has-media / rich-posts), Category, and Source. Category and Source filter server-side via `GET /api/posts?category=&source=` so all posts in the archive are reachable, not just the first 50. Special tokens: `"uncategorized"` (posts with no category) and `"original"` (native posts + posts from deleted sources). The controls bar is permanently visible after initial load regardless of result count.
    [Verified from home.tsx, posts.ts GET /posts route, and openapi.yaml.]

2026-04-29 · DATASTORE · MySQL is now the canonical datastore for both local authoring and deployed publishing, while SQLite is retained only as legacy import material during the migration away from build-coupled storage.
    [Verified from DECISIONS.md, the current DB runtime code, and the successful local MySQL-backed publishing behavior observed in session.]

2026-04-29 · DEPLOY SAFETY · The Hostinger build-scoped SQLite workflow proved capable of replacing deployed content, so future continuity and publishing decisions should assume MySQL is the authoritative persistence layer.
    [Verified from session evidence and the new MySQL-first repository state.]

2026-05-02 · POST UX · Posts in the feed now support a "Maximize" (Expand) action to view the post detail page and a "Code" (Embed) action to copy a frameless iframe snippet for external use.
    [Verified from the current PostCard hover actions and the new /embed/posts/:id route.]

2026-05-02 · AUTH · Auth.js routing uses the default `/api/auth` path. The runtime deletes `AUTH_URL` and `NEXTAUTH_URL` so request origin and callback URLs are derived from the incoming host and Express mount point.
    [Updated 2026-05-15 from `auth/config.ts`, docs/auth-setup.md, and README.md.]

2026-05-02 · USER PROFILES · Users can now customize their profile with a username, bio, website, and social links via a new Settings page, with the UI supporting @username routing and rich profile displays.
    [Verified from the new SettingsPage, updated UserProfile layout, and the backend /users routes.]

2026-05-02 · ENGAGEMENT · Unauthenticated visitors are now directed to "Learn More About Me" linking to the author's profile, rather than being prompted to sign in for comments, aligning with the author-centric focus.
    [Verified from the updated Home page hero and Sign Up view.]

2026-05-02 · CUSTOMIZATION · Owner-only Site Customization now has three independent dimensions — a structural theme (1 of 9), a color palette (1 of 9), and per-field color overrides — with smart-merge so palette swaps preserve any color the owner has hand-edited.
    [Verified from artifacts/microblog/src/lib/site-themes.ts, the SiteCustomizationCard pickers, and the new theme/palette columns on site_settings.]

2026-05-02 · CUSTOMIZATION · Bauhaus remains the canonical default for theme + palette, but the site is now technically capable of rendering in non-Bauhaus visual identities (serif typography, soft shadows, rounded corners, non-tricolor palettes) when the owner selects them.
    [Verified from the 9 themes shipped in index.css and the 9 palettes shipped in site-themes.ts; this expands the visual surface beyond the strict Bauhaus tricolor previously declared in DESIGN.md.]

2026-05-02 · API SAFETY · Theme and palette IDs are enum-validated at the API boundary (OpenAPI enum → Zod safeParse), so unknown values cannot be persisted into site_settings even if the frontend is bypassed.
    [Verified from the regenerated SiteSettings + UpdateSiteSettingsBody Zod schemas and the route's safeParse path.]

2026-05-02 · DESIGN · The Bauhaus identity declared in DESIGN.md is now formally the *default* visual identity rather than an absolute prohibition; alternate themes are owner-chosen exceptions and do not invalidate the default. Captured in DESIGN.md Observed Taste (2026-05-02 DIRECTION + TENSION entries).
    [Confirmed by the human on 2026-05-02 in response to the themes & palettes session self-evaluation.]

2026-05-02 · GOVERNANCE · AGENTS.md was amended in four places to close framework gaps surfaced by the themes & palettes session: (1) the Mode table's Auto Build row now explicitly binds Rules 1–4 and the end-of-task MEMORY/DESIGN proposal step to autonomous-build runtimes including Replit Agent; (2) the Pre-Write Check now treats persisted DB/OpenAPI string enums as Irreversible Decisions; (3) the New Vendor Dependency rule now lists what counts (CDN tags, third-party fonts, webhooks, OAuth, self-hosted-to-hosted swaps); (4) DESIGN.md PROPOSED markers were removed after human confirmation.
    [Authorized explicitly by the human on 2026-05-02; full amendment record in DECISIONS.md "2026-05-02 — AGENTS.md Self-Eval Amendments".]

2026-05-02 · INFRASTRUCTURE · The post-merge script (`scripts/post-merge.sh`) no longer runs `drizzle-kit push`; it only runs `npm ci`. The API server's runtime `ensureTables()` + `ensureColumn()` path in `artifacts/api-server/src/lib/db` is now the single source of truth for schema reconciliation, since it runs on every API restart (which happens immediately after every task merge anyway). For one-shot pushes outside the normal merge flow, the manual command `npm run push-force --workspace=@workspace/db` is documented in the script's comment block.
    [Verified by runPostMergeSetup() completing successfully in ~14s after the change; previously timing out repeatedly because drizzle-kit push hung introspecting the shared Hostinger MySQL host. Decision recorded in DECISIONS.md "2026-05-02 — Post-Merge Schema Sync Removed (Option A)".]

2026-05-02 · CUSTOMIZATION · Per-user profile theming has shipped: any signed-in user can theme their own profile page (`/users/@handle`) using the same 9 themes × 9 palettes × 14 color overrides surface as site-wide owner customization. Theme applies only to the user's profile content — navbar and footer keep the site owner's theme. NULL on a column means "use the site default for that field." A no-flash first paint is achieved by `injectUserTheme()` injecting both a scoped `<style>` block and a `window.__USER_THEME_BOOTSTRAP__` script so `<UserThemeScope>` can render the wrapper with the right attributes from frame 1.
    [Verified from the 16 nullable columns on `users`, the `injectUserTheme` server hook, and the shared `ThemePalettePicker` consumed by both `SiteCustomizationCard` and `UserPageCustomizationCard`. Task #5 merged 2026-05-02.]

2026-05-02 · CUSTOMIZATION · `PATCH /api/users/me` accepts explicit `null` on any of the 16 theme columns, which writes SQL NULL and snaps the user back to the site default for that field. A profile-info save with no theme keys present in the payload preserves the user's saved theme — `buildThemeUpdateSet` distinguishes "absent key" from "explicit null." The Settings card has a "Clear my customization" action that PATCHes nulls for all 16 fields, separate from the picker's in-memory "Reset form to site defaults" action.
    [Verified from the OpenAPI spec (every theme key on UpdateUserProfileBody is nullable), the regenerated zod schema (`.nullish()` on every theme key), and the round-trip tests in `users.test.ts`. Task #7 merged 2026-05-02.]

2026-05-02 · TEST INFRA · `vitest` ^3.2.4 is now a direct devDependency of `@workspace/api-server` rather than relying on transitive resolution from the workspace root. The `injectUserTheme()` server-side first paint path has explicit integration coverage asserting both the site-theme `<style>` block and the user-scoped `<style>` block are present in the rendered HTML, so navbar/footer keeping the site theme is locked in.
    [Verified from `artifacts/api-server/package.json` and `meta-injection.injector.test.ts`. Task #8 merged 2026-05-02.]

2026-05-06 · INBOUND FEEDS · The site supports inbound RSS/Atom feed ingestion (PESOS). The owner subscribes at `/admin/feeds`, items queue at `/admin/pending`, and each source can have an optional custom **Author Name** (`feed_sources.author_name`) that overrides the feed item's declared author for all posts from that source. Ingest priority: `source.authorName || normalizedOriginalAuthor || source.name`. On the timeline, imported post **bylines show the blog/source name** (`sourceFeedName`); the individual author appears in the attribution line as "by `<author>` via `<blog>`" when the two values differ. The `/admin/feeds` source cards now have an Edit panel for Name, Author Name, Feed URL, and Site URL. Cadence per source: `daily` / `weekly` / `monthly`. Bulk-refresh endpoint accepts `X-Cron-Secret`. All public reads filter `status='published'`.
    [Updated 2026-05-06; verified from `feed-sources.ts` ingest logic, `PostCard.tsx` attribution display, `lib/db/src/schema/feeds.ts` `authorName` column, and `admin-feeds.tsx` edit panel.]

2026-05-02 · SEARCH · Visitors and the owner can search published posts at `/search` with relevance ranking and structured filters (date range, source, author, content format). The index is native MySQL InnoDB FULLTEXT on a new `posts.content_text` shadow column populated automatically from `posts.content` via the shared `computeContentText` helper. Always filters `WHERE status = 'published'` — even for the owner; the search and the public timeline are semantically the same set. The header search bar is reachable on every page on every viewport, with `/` to focus and `Esc` to clear.
    [Verified from the new Search section in replit.md, `routes/posts.ts` `GET /search`, the `posts_content_text_fulltext` index created by `ensureIndex` in `lib/db/src/migrate.ts`, and the `/search` page in the frontend. Task #13 merged 2026-05-02.]

2026-05-04 · RUNTIME · Root `npm run dev` is now the standard one-port local/Replit development command; the app listens on `PORT`, and `npm run dev:hot` is reserved for Vite hot reload. `.env` sets `PORT=4000` for local development (macOS AirPlay Receiver occupies 5000). On Replit, the workflow sets `PORT=5000` inline, overriding `.env`; `externalPort = 80` routes the default webview URL there. Direct port access via `:5000` is also mapped (`externalPort = 5000`). `platform.creatrweb.com` is a CNAME to `*.replit.dev` (not a Replit production deployment), so it is subject to the same proxy interception as the dev URL.
    [Updated 2026-05-06 after Replit port routing investigation, proxy root-cause analysis, and local port change to 4000.]

2026-05-04 · AI · Opt-in AI assistance is owner-only, disabled by default per vendor, and gated by saved vendor/model/key configuration before any AI action appears in the composer or admin piece flows.
    [Updated 2026-05-15 from `/admin/ai`, `/api/ai/settings`, `/api/ai/process`, and owner AI vendor hooks.]

2026-05-04 · AI · Backend AI vendor identifiers use the current stable slug set `openrouter`, `opencode-zen`, `opencode-go`, and `google`, while human-readable labels are exposed for frontend display.
    [Updated 2026-05-15 from `ai-settings.ts`, OpenAPI enums, and generated client types.]

2026-05-05 · AI · AI provider failures are now classified explicitly as `timeout`, `upstream_http`, `parse`, `network`, or `unknown_model`, with structured safe logging that includes vendor, model, transport kind, endpoint family, URL, and real upstream status when available.
    [Confirmed by the human during the AI hardening session and verified from `artifacts/api-server/src/lib/ai-providers.ts` plus the focused provider/route tests.]

2026-05-05 · AI UX · The composer AI failure path now reads generated `ApiError` payloads instead of assuming Axios-style errors, preserves the current draft on failure, and shows a user-friendly timeout message when the provider takes too long.
    [Confirmed by the human during the AI hardening session and verified from `RichPostEditor.tsx`, `ai-error.ts`, and the focused editor test coverage.]

2026-05-05 · AI SETTINGS · AI configuration is owner-only and managed from `/admin/ai`, with one saved model slug and one encrypted API key per supported vendor row in `user_ai_vendor_settings`. The supported vendor set is hard-restricted to `openrouter`, `opencode-zen`, `opencode-go`, and `google`.
    [Updated 2026-05-15 after OpenRouter replaced Kilo Gateway; verified from `ai-settings.ts`, AI routes, OpenAPI contract, and Admin AI page.]

2026-05-05 · AI EDITOR · The owner post composer and owner post-edit flows now expose an AI vendor dropdown plus the `AI` button, and each request explicitly selects a configured vendor while using that vendor’s saved model/key from Admin settings.
    [Confirmed by the human during the Phase 4 AI editor rework and verified from `ComposePost.tsx`, `PostCard.tsx`, `admin-pending.tsx`, `RichPostEditor.tsx`, and focused frontend tests.]

2026-05-06 · USER PROFILES · Public profile identity distinguishes a stable `username` handle (for `/users/@handle` URLs) from the required editable display name (`users.name`). Changing the display name via `/settings` now cascades immediately to all owner-authored posts (`posts.author_name` WHERE `author_user_id = userId`). Comment `author_name` rows are not rewritten — comments keep the name as posted.
    [Confirmed during the display-name session and the feed-attribution session; verified from `PATCH /api/users/me` in `users.ts` and the cascade UPDATE on `postsTable`.]

2026-05-06 · CUSTOMIZATION · The owner-facing "Reset to Bauhaus defaults" action is intentionally non-destructive: it resets only theme/palette/color values and preserves all site copy and links.
    [Confirmed by the human after the earlier text-loss regression and verified from `SiteCustomizationCard` behavior plus the new regression test.]

2026-05-06 · POST EDITOR · The owner post composer and edit-post flow now use a compact square WYSIWYG-style toolbar with `H1`–`H6`, direct YouTube URL insertion, a mobile `More` menu, and explicit bold rendering so `strong` text stays visibly heavier.
    [Confirmed by the human during the post/editor refinement session and verified from `RichPostEditor`, `PostContent`, and focused editor tests.]

2026-05-08 · SYNDICATION · Blog URL scoping for WordPress.com and Blogger OAuth platforms is implemented. `platform_oauth_apps.blog_url` stores the owner's blog URL. WordPress.com start route adds `blog=URL` to the authorize URL so the token is scoped to the correct blog; the callback reads `blog_id` directly from the token response. Blogger callback's **primary** blog ID discovery fetches the blog's public HTML and extracts the numeric ID from the Atom feed `<link>` element (no Google API required); `blogs/byurl` and `users/self/blogs` API calls are fallbacks. Non-2xx Blogger API responses now log the full error body. The OAuth state store (`Map<string, { expiry: number; blogUrl? }>`) carries `blogUrl` from start to callback. The `/admin/platforms` credentials dialog has a "Your blog URL" input, and "Update app settings" lets the owner re-open it — but only when the platform is already connected (`isConnected`).
    [Implemented 2026-05-08; `extractBloggerBlogIdFromHtml` helper in `platform-oauth.ts`; verified from `platform-oauth-apps.ts` route, state store, `openapi.yaml` + orval codegen, and `admin-platforms.tsx`.]

2026-05-08 · POSTS · Posts now have an optional `title VARCHAR(500) NULL` column. All GET selects project `title`; POST stores `title?.trim() || null`; PATCH is key-presence-aware (absent key = no change, explicit empty string = null). The `RichPostEditor` renders a native `<input>` above the TipTap area for the title; `PostCard` renders a `<h2>` heading above the body when `post.title` is truthy; feed generation (`buildAtom`, `buildJsonFeed`) prefers `post.title` over a content-derived summary; syndication `buildPayload` uses `post.title?.trim() ?? ""` (empty string → no H1 on WordPress/Blogger).
    [Implemented 2026-05-08; verified from `lib/db/src/schema/posts.ts`, `migrate.ts`, `routes/posts.ts`, `openapi.yaml` + orval codegen, `RichPostEditor.tsx`, `ComposePost.tsx`, `PostCard.tsx`, `feeds.ts`, and `syndication/index.ts`.]

2026-05-08 · PLATFORMS UI · Medium is no longer offered as a connection option in the admin Platforms page — removed from the `PLATFORMS` constant, `MediumTokenDialog` deleted, `"medium"` dropped from `credentialKind` union. Reason: Medium's API restrictions make reliable cross-posting impossible. The backend adapter and any existing DB rows are untouched; the entry can be restored to the UI if Medium improves API access. The Blogger credentials dialog now includes: API enablement instruction, scope addition step (`https://www.googleapis.com/auth/blogger` on the consent screen), and an amber callout explaining Testing vs. Production mode and the test-user requirement.
    [Implemented 2026-05-08; verified from `admin-platforms.tsx` PLATFORMS array, PlatformDef type, PlatformCard, and OAuthAppCredentialsDialog.]

2026-05-09 · INTERACTIVE PIECES · AI-generated interactive pieces no longer accept unvalidated model output as a trusted draft surface. The current generation flow requires `html`, `css`, and `javascript` Markdown code blocks, extracts them server-side, preflights the JavaScript against the selected runtime, and only surfaces a draft after validation succeeds.
    [Updated 2026-05-15 from `art-pieces.ts`, `routes/art-pieces.ts`, `piece-embed-html.ts`, `ArtPieceRenderer.tsx`, and the composer/admin UI flow.]

2026-05-10 · INTERACTIVE PIECES · The supported AI-generated interactive-piece engines are now `p5`, `c2`, and `three`. A-Frame was explicitly rolled back from the product: it is no longer a valid saved/API engine, no longer appears in owner generation UIs, and existing A-Frame content is intentionally not supported.
    [Confirmed by the owner during the 2026-05-10 interactive-piece rollback session; implementation recorded in DECISIONS.md and docs/dependencies.md.]
    [Implemented 2026-05-10; verified from `artifacts/api-server/src/lib/art-pieces.ts`, `lib/db/src/migrate.ts`, and the updated composer/admin UI flow.]

2026-05-09 · INTERACTIVE PIECES · Piece generation is bounded and transparent: the UI shows an Attempts counter, generation can be stopped manually, the API enforces a one-minute timeout and bounded repair loop, and failed/timed-out runs do not create saved pieces.
    [Implemented 2026-05-09; verified from the validated draft response contract, generation dialog UI, and focused backend/frontend tests.]

2026-05-09 · INTERACTIVE PIECES · Saving a new piece or new piece version now requires a one-time validated draft token issued by `/api/art-pieces/generate`; `POST /art-pieces` and `POST /art-pieces/:id/versions` no longer trust browser-submitted sketch code directly.
    [Implemented 2026-05-09; verified from the narrowed OpenAPI request bodies, token consumption logic, and version metadata persistence.]

2026-05-10 · INBOUND FEEDS · Feed source profile pages are live. Visiting `/users/feed:N` or `/users/@handle` (once a username is set) renders a feed source profile showing the blog name, optional bio, site URL as a clickable link, "Automated feed" badge, and a live post list. `GET /users/:id` now dispatches on `feed:N` prefix and feed-source username before falling through to human user lookup. No user records are created for feed sources; `sourceType: "feed"` in the response is the discriminator. `feed_sources` gained `username VARCHAR(100) NULL` and `bio TEXT NULL` columns (additive, via `ensureColumn`). Username uniqueness is enforced at the application layer across both `users` and `feed_sources` tables.
    [Implemented 2026-05-10; verified from `lib/db/src/schema/feeds.ts`, `migrate.ts`, `routes/users.ts`, `routes/feed-sources.ts`, `pages/user-profile.tsx`, and `pages/admin-feeds.tsx`.]

2026-05-10 · INTERACTIVE PIECES · Art piece rendering has been systemically overhauled to use native browser sandboxing (`<iframe>` with `srcdoc`) for all engines (P5, C2, Three.js), replacing brittle JavaScript Proxies. `app.ts` now serves full library directories under `/api/runtimes` to support modular loading. Three.js embeds include robust `autoFit` camera logic using `Box3.setFromObject(scene)` at frame 15. The generation pipeline uses boilerplate templates and Markdown code block extraction (html, css, js) with a mandatory three-block return. AI retry loop reuses previous attempts (up to 5 attempts). Admin UI now supports real-time preview of manual code edits and provides explicit Metadata/HTML/CSS/JS tabs with auto-populated fallback templates for legacy pieces. Version pinning was removed from embeds to enable "live" piece updates across the site.
    [Implemented 2026-05-10/11; verified from `art-pieces.ts`, `piece-embed-html.ts`, `ArtPieceRenderer.tsx`, and `admin-pieces.tsx` overhaul.]

2026-05-11 · HOMEPAGE UX · The main home feed now updates automatically after any post creation, update, deletion, or approval. This is achieved by explicitly invalidating the custom `"listPosts"` React Query key in the `onSuccess` callbacks of `ComposePost.tsx`, `PostCard.tsx`, `admin-feeds.tsx`, and `admin-pending.tsx`.
    [Implemented 2026-05-11; verified from the synchronized invalidation logic across all post-mutating components.]
