<!-- Agent reads this file at every session start. Surface any entry marked PENDING CONFIRMATION
to the human before proceeding. Do not act on a pending entry — wait for explicit confirmation
or rejection. -->

2026-04-28 · PRODUCT · The project direction is an author-owned microblog where only the site owner publishes canonical posts, while signed-in visitors can comment and react.
    [Verified from CONSTRAINTS.md and DECISIONS.md.]

2026-04-28 · AUTH · The repo direction is a migration away from Clerk toward Auth.js with GitHub and Google as the initial OAuth providers.
    [Verified from DECISIONS.md, docs/auth-setup.md, and untracked auth migration files.]

2026-04-28 · ROLES · The initial local capability model is `owner` plus `member`, with owner bootstrap handled by manual promotion after the owner's first successful login.
    [Verified from CONSTRAINTS.md and docs/auth-setup.md.]

2026-04-28 · DEV SETUP · Local development expects separate frontend and backend processes, with the frontend on `http://localhost:3000`, the backend on `http://localhost:8080`, and frontend proxying for `/api/*` and `/auth/*`.
    [Verified from docs/auth-setup.md and DECISIONS.md.]

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

2026-04-29 · FEEDS · The site now publishes public standardized feeds at `GET /feed.xml` (Atom), `GET /feed.json` (JSON Feed 1.1), and `GET /export/json` (mf2-JSON), while preserving `GET /export.json` as a compatibility alias.
    [Verified from DECISIONS.md and the current route surface.]

2026-04-29 · HOMEPAGE UX · The owner post composer is collapsed by default, and the home feed now includes client-side sort/filter controls for browsing posts.
    [Verified from DECISIONS.md and the current homepage component structure.]

2026-04-29 · DATASTORE · MySQL is now the canonical datastore for both local authoring and deployed publishing, while SQLite is retained only as legacy import material during the migration away from build-coupled storage.
    [Verified from DECISIONS.md, the current DB runtime code, and the successful local MySQL-backed publishing behavior observed in session.]

2026-04-29 · DEPLOY SAFETY · The Hostinger build-scoped SQLite workflow proved capable of replacing deployed content, so future continuity and publishing decisions should assume MySQL is the authoritative persistence layer.
    [Verified from session evidence and the new MySQL-first repository state.]

2026-05-02 · POST UX · Posts in the feed now support a "Maximize" (Expand) action to view the post detail page and a "Code" (Embed) action to copy a frameless iframe snippet for external use.
    [Verified from the current PostCard hover actions and the new /embed/posts/:id route.]

2026-05-02 · AUTH · Auth.js routing has been restored to the default `/api/auth` path to ensure compatibility with existing OAuth provider configurations.
    [Verified from the updated app.ts mount point and the requirement for a full URL in AUTH_URL.]

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

2026-05-02 · INBOUND FEEDS · The site now supports inbound RSS/Atom feed ingestion (PESOS — Publish Elsewhere, Syndicate to Own Site). The owner subscribes to feeds at `/admin/feeds`, items land in a pending-review queue at `/admin/pending` grouped by source, and the owner approves or rejects each item before it appears on the public timeline. Imported posts carry the original feed author's name verbatim and a `u-url u-syndication` link to the canonical URL. Cadence per source is `daily` / `weekly` / `monthly`; the bulk-refresh endpoint accepts an `X-Cron-Secret` header for Replit Scheduled Deployments. All public reads filter `status='published'`.
    [Verified from the PESOS section in replit.md, `routes/feed-sources.ts`, `routes/pending-posts.ts`, the new `feed_sources` and `feed_items_seen` tables, and the new columns on `posts`. Task #9 merged 2026-05-02.]

2026-05-02 · SEARCH · Visitors and the owner can search published posts at `/search` with relevance ranking and structured filters (date range, source, author, content format). The index is native MySQL InnoDB FULLTEXT on a new `posts.content_text` shadow column populated automatically from `posts.content` via the shared `computeContentText` helper. Always filters `WHERE status = 'published'` — even for the owner; the search and the public timeline are semantically the same set. The header search bar is reachable on every page on every viewport, with `/` to focus and `Esc` to clear.
    [Verified from the new Search section in replit.md, `routes/posts.ts` `GET /search`, the `posts_content_text_fulltext` index created by `ensureIndex` in `lib/db/src/migrate.ts`, and the `/search` page in the frontend. Task #13 merged 2026-05-02.]
