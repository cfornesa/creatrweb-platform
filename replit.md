# Workspace

## Overview

Full-stack microblogging platform ("Microblog") — npm workspace monorepo, TypeScript throughout.

## Stack

- **Monorepo tool**: npm workspaces
- **Node.js version**: 24
- **Package manager**: npm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: MySQL (mysql2) + Drizzle ORM (dialect: mysql2)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- **Build**: esbuild (ESM bundle)
- **Auth**: Auth.js with GitHub + Google OAuth, local sessions, and app-owned roles
- **Frontend**: React + Vite (Tailwind CSS)

## Packages

| Package | Path | Purpose |
|---|---|---|
| `@workspace/api-server` | `artifacts/api-server/` | Express API server (posts, comments, users, feed stats) |
| `@workspace/microblog` | `artifacts/microblog/` | React + Vite frontend (home feed, post detail, user profile) |
| `@workspace/db` | `lib/db/` | Drizzle schema + db client (MySQL via `mysql2`, configured by env) |
| `@workspace/api-spec` | `lib/api-spec/` | OpenAPI 3.1 spec + Orval codegen config |
| `@workspace/api-client-react` | `lib/api-client-react/` | Generated React Query hooks + custom fetch |
| `@workspace/api-zod` | `lib/api-zod/` | Generated Zod request/response schemas |

## Key Commands

- `npm run typecheck` — full typecheck across all packages
- `npm run build` — typecheck + build all packages
- `npm run codegen --workspace=@workspace/api-spec` — regenerate API hooks and Zod schemas from OpenAPI spec
- `npm run push --workspace=@workspace/db` — push DB schema changes (dev only)
- `npm run dev:api` — run API server locally
- `npm run dev:web` — run the Vite frontend locally on `FRONTEND_PORT`
- `npm run list-users --workspace=@workspace/scripts` — list local users after first sign-in
- `npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com` — promote your account to owner

## Database

MySQL (Hostinger-hosted in production, also MySQL locally). Drizzle schema in `lib/db/src/schema/`. Core tables: `users`, `accounts`, `sessions`, `verification_tokens`, `posts`, `comments`, `reactions`, `site_settings` (singleton row, id=1), `feed_sources` (owner-subscribed RSS/Atom feeds), and `feed_items_seen` (per-source dedup ledger). Legacy SQLite material under `data/` is retained only as historical import material from the migration; nothing reads or writes it at runtime.

Schema reconciliation is performed by the API server at startup via `ensureTables()` + `ensureColumn()` + `ensureForeignKey()` + `ensureIndex()` in `lib/db/src/migrate.ts`. This is the single source of truth — the post-merge script (`scripts/post-merge.sh`) runs only `npm ci`. For one-shot pushes outside the normal merge flow, `npm run push-force --workspace=@workspace/db` is documented in the script's comment block.

For environments where schema is applied by hand (e.g. Hostinger via phpMyAdmin), two copy-pasteable SQL scripts ship alongside the schema:

- `lib/db/install.sql` — **full database install** for forkers. Creates every table (`users`, `accounts`, `sessions`, `verification_tokens`, `feed_sources`, `feed_items_seen`, `posts`, `comments`, `reactions`, `site_settings`), all indexes including the `posts_content_text_fulltext` FULLTEXT index, every foreign key, and seeds the `site_settings` singleton row with neutral placeholder copy. Idempotent (uses `CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE`). The bottom of the file also lists 15 commented-out maintenance queries (promote/demote owner, list users, approve/reject pending posts, vacuum stale dedup rows, run the same FULLTEXT query the app uses, etc.).
- `lib/db/site_settings_install.sql` — narrower script for the `site_settings` table only, kept around for upgrades from earlier deploys that pre-date the rest of the schema being applied by hand.

## API Routes

- `GET /api/healthz` — health check
- `GET /api/posts` — list posts (paginated, with comment counts)
- `POST /api/posts` — create post (auth required)
- `GET /api/posts/:id` — get post + comments
- `DELETE /api/posts/:id` — delete own post (auth required)
- `GET /api/posts/user/:userId` — get user's posts
- `POST /api/posts/:postId/comments` — add comment (auth required)
- `DELETE /api/comments/:id` — delete own comment (auth required)
- `GET /api/users/me` — current user profile (auth required)
- `GET /api/feed/stats` — total posts + comments count
- `GET /api/site-settings` — public site identity + color palette (singleton)
- `PATCH /api/site-settings` — update site identity + color palette (owner only)
- `GET /api/feed-sources` — list subscribed RSS/Atom sources (owner only)
- `POST /api/feed-sources` — subscribe to a new feed (owner only)
- `PATCH /api/feed-sources/:id` — update name/url/cadence/enabled (owner only)
- `DELETE /api/feed-sources/:id` — unsubscribe (owner only; ledger cascades)
- `POST /api/feed-sources/:id/refresh` — fetch one source now (owner only; `?force=1` skips cadence)
- `POST /api/feed-sources/:id/approve-all` — bulk-approve every pending post from a source (owner only)
- `POST /api/feed-sources/refresh` — bulk refresh all enabled, due sources (owner cookie OR `X-Cron-Secret` header)
- `GET /api/posts/pending` — list items waiting for review (owner only)
- `POST /api/posts/:id/approve` — promote pending → published (owner only)
- `POST /api/posts/:id/reject` — discard a pending item (owner only)
- `GET /api/posts/search` — full-text post search with filters (public)
- `GET /api/feed-sources/public` — list of feed sources that have at least one published post (public; `id` + `name` only)

## Auth.js

- Backend auth is mounted at `/auth/*` in the Express server
- Local development expects:
  - frontend at `http://localhost:3000`
  - backend at `http://localhost:8080`
- The frontend dev server proxies both `/api/*` and `/auth/*` to the backend
- The web app uses cookie-backed sessions; do not attach bearer tokens for browser API calls
- The first owner is promoted manually after first login using the scripts package

## Site Customization

The `owner` user can customize site-wide identity, theme, palette, and individual colors via the **Site Customization** card on `/settings` (owner-only, not visible to members). The customization has three independent dimensions:

1. **Theme** (one of 9): controls *structure* — borders, shadows, radius, fonts, font weights, heading case/tracking. Applied via a `data-theme="..."` attribute on `<html>` (set by `<ThemeInjector />`); each theme is a CSS rule in `artifacts/microblog/src/index.css` overriding `--app-*` structural variables. The 9 themes are `bauhaus` (default), `traditional`, `minimalist`, `academic`, `airy`, `nature`, `comfort`, `audacious`, `artistic`.
2. **Palette** (one of 9): controls the *14 color values* (light + dark backgrounds, foregrounds, primary/secondary/accent/muted/destructive with their foreground pairs). Stored as HSL component strings (e.g. `0 100% 50%`) and injected as CSS custom properties by `<ThemeInjector />`. The 9 palettes are `bauhaus` (default), `monochrome`, `newsprint`, `ocean`, `forest`, `sunset`, `sepia`, `high-contrast`, `pastel`.
3. **Per-field color overrides**: any of the 14 colors can be edited individually via color pickers. **Smart-merge**: switching the palette only replaces colors that still match the previously-active palette; any field the owner customized survives the swap (`smartMergePalette` in `artifacts/microblog/src/lib/site-themes.ts`).

The catalog of themes and palettes lives in `artifacts/microblog/src/lib/site-themes.ts`. Adding or renaming a theme requires adding both an entry there and a matching `[data-theme="..."]` rule in `index.css`. Adding a palette only requires the catalog entry.

**Identity & copy fields**: site title (drives navbar wordmark, browser tab title, and post share-card title), hero heading + subheading, hero CTA label + link, "About This Platform" heading + body, copyright name, footer credit.

A "Reset to Bauhaus defaults" button restores theme=`bauhaus`, palette=`bauhaus`, and the original tricolor color values.

Backend storage: singleton row in `site_settings` (id=1) with `theme` and `palette` columns (varchar(32) NOT NULL DEFAULT `'bauhaus'`). Backed by `requireOwner` middleware on `PATCH /api/site-settings`. The frontend hook is `useSiteSettings()` in `artifacts/microblog/src/hooks/use-site-settings.ts`. Google Fonts (Lora, EB Garamond, Inter, Nunito, Quicksand, Space Grotesk, Bebas Neue, Caveat) are preloaded in `index.html`.

## Per-User Profile Theming

Any signed-in user can theme their own profile page (`/users/@handle`) using the same 9-themes × 9-palettes × 14-color-overrides surface that powers site-wide owner customization. Their theme applies only to their profile content; the navbar and footer always keep the site owner's theme.

- **Schema**: 16 nullable columns on `users` mirroring `site_settings` (`theme`, `palette`, and the 14 HSL color fields). Backfilled by `ensureColumn` so existing rows stay valid. NULL on every column means "use the site default."
- **Null-as-clear semantics**: `PATCH /api/users/me` accepts explicit `null` for any theme column, which writes SQL NULL and snaps the user back to the site default for that field. The 16 columns are documented as nullable in OpenAPI; orval-regenerated `UpdateMeBody` is `.nullish()` on every theme key. A profile-info save (no theme keys present in the payload) preserves the user's saved theme — `buildThemeUpdateSet` distinguishes "absent key" from "explicit null."
- **Settings UI**: the **Profile Page Theme** card on `/settings` renders the same picker as the site card (extracted as a shared component) and includes a "Clear my customization" action that PATCHes nulls for all 16 fields. The picker also has a separate "Reset form to site defaults" action that only edits the in-memory form so the user can preview a reset before saving.
- **No-flash first paint (SSR hookup)**: the API server's catch-all HTML route for `/users/:handle` calls `injectUserTheme()` (`artifacts/api-server/src/lib/meta-injection.ts`), which injects two synchronized hooks into the initial HTML when the user has any customization:
  1. `<style id="user-theme-server-style">` with the scoped CSS targeting `[data-user-theme-scope="user-<id>"]`.
  2. `<script id="user-theme-bootstrap">` publishing `{scopeKey, theme}` on `window.__USER_THEME_BOOTSTRAP__`.
  `<UserThemeScope>` reads the bootstrap synchronously on its first render via `useMemo`, so the wrapper exists with the right attributes from frame 1 — even before the React Query fetch resolves.
- **Security hardening**: every interpolated color is validated against a strict HSL regex (`<h> <s>% <l>%`, max 32 chars) on both the server style builder and the client component, so a bad value is dropped rather than rendered. The bootstrap script body is JSON-stringified with `<` escaped as defense-in-depth. The scope key is whitelisted to `user-[a-zA-Z0-9_-]+` server- and client-side so the attribute selector cannot break out.
- **Imported posts and theming**: feed-imported posts have `author_user_id = NULL` (their byline is the original feed author, who is not a local user), so they correctly fall back to the site default theme — they have no per-user theme to apply.

## Inbound Feeds (PESOS)

The owner can subscribe to external sites' RSS/Atom feeds at `/admin/feeds` and review imported items at `/admin/pending` before they appear on the public timeline.

- **Schema**: `feed_sources` (subscriptions, including `next_fetch_at` for the cadence gate) + `feed_items_seen` (per-source dedup ledger keyed by `sha256(guid|id|link+title)`). Posts gain `status` (`'published'` | `'pending'`), `source_feed_id` (FK → `feed_sources.id` with `ON DELETE SET NULL` so unsubscribing keeps already-imported posts but drops the back-pointer), `source_guid`, `source_canonical_url`. The FK is added by `ensureForeignKey` in `lib/db/src/migrate.ts` so pre-existing deploys with the bare nullable column pick it up on next boot. All public reads filter `status='published'`; `GET /api/posts/:id` for a pending post returns 404 to non-owners and the full body to authenticated owners. `POST /api/posts/:postId/comments` returns 404 on pending posts for non-owners but **lets the owner comment**, which is what makes pre-publish review of imported items workable.
- **Author convention**: feed-imported posts use `author_id='feed:<sourceId>'`, `author_user_id=NULL`. `author_name` is the original item author from `<dc:creator>` / `<author>` (with the source name as a fallback) so bylines on the timeline credit the actual writer; the originating feed source name is joined in as `sourceFeedName` on `Post` / `PendingPost` responses and surfaced as the "via {source}" badge. HTML source bodies are wrapped with the original title as `<h2>` and an attribution paragraph with a `u-url u-syndication`-classed link to the canonical URL (microformats2-compatible — `u-url` marks the canonical permalink of the entry, `u-syndication` marks this site as the syndicated copy).
- **Plain-vs-HTML parity**: `normalizeFeedItem` returns `{ content, contentFormat }` matching the `posts` columns. Source items whose body is HTML (`<content:encoded>` / `<content>` / `<summary>`, or any tag-bearing snippet) land as `contentFormat='html'`. Plain-text-only items (only `contentSnippet`, no markup) land as `contentFormat='plain'` with the body kept verbatim and a text attribution footer (`by Author · via Source — <canonicalUrl>`); plain posts skip mf2 class markers because they have no HTML wrapper.
- **Cadence**: `daily` / `weekly` / `monthly`. After every successful fetch, `feed_sources.next_fetch_at` is set to `now + cadenceInterval`; the bulk-refresh endpoint skips any source whose `next_fetch_at` is in the future unless `?force=1` is passed. NULL `next_fetch_at` (never fetched, or freshly added) is treated as immediately due. Cadence edits recompute the next-due time off `last_fetched_at` so a source isn't stuck waiting at the old interval.
- **Dedup**: post-first, ledger-second ordering in `ingestOneItem` (`artifacts/api-server/src/routes/feed-sources.ts`) — the post row is written first, then the `(source_id, guid_hash)` ledger row is inserted with `post_id` already populated. If the post insert fails for any reason (validation, transient DB error, etc.) the ledger is never touched, so the item stays retriable on the next refresh. The unique key on `(source_id, guid_hash)` is the race-safety net: two concurrent refreshes can both pass the cheap `isAlreadySeen` check and both insert posts; the second `insertDedupRow` throws `ER_DUP_ENTRY` (mysql errno 1062) and the loser's post is removed by a compensating `deletePost`, leaving exactly one row on the timeline. The per-item logic is decoupled from Drizzle behind the `IngestDb` contract so the ordering rule is unit-tested with stubs (no MySQL) — see `feed-sources.test.ts`.
- **Sanitization**: HTML feed bodies go through `sanitizeRichHtml` (`artifacts/api-server/src/lib/html.ts`) — `<script>`, `javascript:` URLs, and other dangerous markup are stripped. The `class` attribute on `<a>` survives so microformats2 markers (`u-url`, `u-syndication`, `h-cite`, etc.) are preserved. Plain-text bodies bypass the sanitizer because the frontend's plain-text renderer is already escape-safe.
- **Bulk approve**: `POST /api/feed-sources/:id/approve-all` flips every pending post from the given source to published in a single statement. Surfaced in two places: per-row on `/admin/feeds`, and per-source-group on `/admin/pending` (the pending queue groups items by their `sourceFeedId` and renders a section header per source with its own "Approve all from this source" confirmation dialog), so the owner can backfill a trusted source without clicking through every item.
- **Ingest helpers**: `computeGuidHash`, `normalizeFeedItem`, `pickOriginalAuthor`, `cadenceIntervalMs`, `computeNextFetchAt`, `isSourceDue`, `fetchFeed` (project-neutral `User-Agent: MicroblogFeedIngest/1.0`) live in `artifacts/api-server/src/lib/feed-ingest.ts` and are unit-tested in `feed-ingest.test.ts` (27 tests covering XSS-via-author-field, `u-url` markup, plain-vs-html branching, and cadence math). The atomic per-item ingest function `ingestOneItem` and the `isDuplicateKeyError` mysql2 detector live in `routes/feed-sources.ts` and are unit-tested in `feed-sources.test.ts` (9 tests covering happy path, already-seen short-circuit, the dedup-after-post regression, retry on transient post failure, and lost-race compensation).

### Scheduled refresh

`POST /api/feed-sources/refresh` accepts owner cookie auth **or** an `X-Cron-Secret` header compared against `process.env.CRON_SECRET` via `crypto.timingSafeEqual`. To run it on a schedule with Replit Scheduled Deployments:

1. Set the `CRON_SECRET` secret in the deployment.
2. Create a Scheduled Deployment whose command issues `curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" https://<your-deployed-domain>/api/feed-sources/refresh`.
3. Pick an interval that matches your fastest cadence (e.g. hourly is fine; daily/weekly sources self-throttle via `isSourceDue`).

Add `?force=1` only when you intentionally want to bypass the cadence gate (e.g. a manual debugging run from the admin UI's "Refresh all" button).

## Search

Visitors and the owner can search published posts at `/search` with relevance ranking and structured filters. The header search bar is reachable on every page on every viewport (inline input on sm+, magnifier-icon-button + bottom-sheet on mobile). The `/` hotkey focuses the inline input on desktop or opens the sheet on mobile (skips form/contenteditable targets); `Esc` clears and blurs.

- **Index**: native MySQL InnoDB FULLTEXT on `posts.content_text` (a nullable text shadow column populated automatically by `computeContentText` in `artifacts/api-server/src/lib/html.ts` — the single source of truth for "what does the reader see in this post body"). Both insert and update paths in `routes/posts.ts` and the production ingest path in `routes/feed-sources.ts` populate `content_text` with the same helper, so the index never drifts from the rendered text. Legacy rows are backfilled in app code via `backfillPostContentText`, invoked from `index.ts` after `ensureTables` — the same JS stripper is used for backfill as for inserts so historical and new rows are identical. Idempotent: cheap no-op once every row is filled. The FULLTEXT index `posts_content_text_fulltext` is created via `ensureIndex()` in `lib/db/src/migrate.ts` (a reusable wrapper for `CREATE FULLTEXT INDEX IF NOT EXISTS`).
- **Endpoint**: `GET /api/posts/search` accepts `q` (text query, optional), `from` / `to` (ISO date bounds), `sources` (comma-separated `feed_source.id` values plus the literal `native` for owner-authored posts), `author` (case-insensitive substring match against `author_name`), `format` (comma-separated `html` / `plain`), and `page` / `limit` (capped at 50). Always filters `WHERE status = 'published'` even for the owner — the search and the public timeline are semantically the same set. `parseSearchQuery` rebuilds user input as `+term*` boolean-mode expression with operators stripped, so query-injection is impossible. `buildSearchSnippet` HTML-escapes the window then wraps matches in `<mark>` for safe rendering on the client via `dangerouslySetInnerHTML`.
- **Public source list**: `GET /api/feed-sources/public` returns only `id` + `name` for sources that have at least one published post — visitors get the same source filter as the owner without leaking owner-only feed metadata (URLs, cadence, error state).
- **Results page** (`/search`): URL is the source of truth for every filter — shareable, bookmarkable, back/forward-safe. Filter sidebar covers query, date range, sources (public list + native), author, and content format. Source filter defaults visually to "all checked" when no source param is set; unchecking one box collapses to the explicit inverse list and re-checking all collapses back to the empty default so the URL stays clean. Active-filter chips above the result list support one-click removal. Empty result set echoes the active filters back.
- **Query-string subscription**: every interaction on `/search` is a query-string-only navigation (filters, paging, header search submits to `/search?…`), and wouter's `useLocation` only subscribes to the pathname. The page therefore subscribes to the search string directly via wouter's `useSearch` hook (built on `useSyncExternalStore` over `popstate`/`pushState`/`replaceState`/`hashchange`) so any `?…`-only URL change re-renders the page. Without this the second and subsequent searches from the header silently failed to update the page.
- **Header `SearchBar` URL sync** (`artifacts/microblog/src/components/layout/SearchBar.tsx`): the input value mirrors the URL's `q` (so landing on `/search?q=hello` shows "hello" in the field, and removing the chip empties it). A `pendingUrlQRef` defers any URL change that arrives while one of the inputs is focused and re-applies it `onBlur`, so typing isn't clobbered mid-keystroke but back/forward-while-focused is still respected. Empty submit is a deliberate no-op when the URL already has a `q` (so users can't accidentally wipe their query with a blank field). Esc clears + blurs on both desktop and the mobile sheet input.
- **Tests**: `src/pages/__tests__/search.test.tsx` guards the regression by changing only the query string via `history.pushState` and asserting the chip UI updates; `src/components/layout/__tests__/SearchBar.test.tsx` covers URL→input init, outside-driven re-sync, focused-input no-clobber + blur replay, blank-submit no-op, and Esc-clear.

## Forking & Self-Hosting

If someone clones this repo to run their own microblog, the path is:

1. **Database**: create a fresh MySQL 8+ / MariaDB 10.5+ database, then either
   - run the API server once and let `ensureTables()` build the schema (recommended on Replit / any Node host), **or**
   - paste `lib/db/install.sql` into your SQL client (recommended on shared hosts where you only have phpMyAdmin). The script is fully idempotent and includes 15 commented-out maintenance queries at the bottom.
2. **Environment variables** (set in `.env` for local dev or as platform secrets in production). Required-ness reflects what `artifacts/api-server/src/` actually reads via `process.env.*`:

   | Variable | Required | Purpose |
   |---|---|---|
   | `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` | yes | MySQL connection (read in `lib/db/src/index.ts`). |
   | `DB_PORT` | optional | Defaults to `3306`. |
   | `DB_SSL` | optional | `true` to require TLS on the DB connection. |
   | `AUTH_SECRET` | yes | Long random string for Auth.js session signing. |
   | `GITHUB_ID`, `GITHUB_SECRET` | one OAuth provider required | GitHub OAuth app credentials. |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | one OAuth provider required | Google OAuth client credentials. |
   | `ALLOWED_ORIGINS` | production | Comma-separated origins the API's CORS layer trusts. Falls back to `http://localhost:20925, http://localhost:8080` when unset, so local dev runs without it. |
   | `CRON_SECRET` | optional | Required only if you want the bulk feed refresh endpoint to be triggerable by a Scheduled Deployment without owner cookies. |
   | `PUBLIC_SITE_URL`, `SITE_TITLE`, `SITE_DESCRIPTION`, `SITE_AUTHOR_NAME` | optional | SSR meta-tag fallbacks for the catch-all HTML route before the singleton `site_settings` row is loaded. |
   | `STATIC_FILES_PATH` | optional | Override for where the API server serves the built frontend bundle from in production. |
   | `LOG_LEVEL` | optional | `debug` / `info` / `warn` / `error`; defaults to `info`. |
   | `NODE_ENV` | optional | Standard `production` / `development` toggle (affects logging + cache headers). |
   | `AUTH_URL` | yes in prod | Read by Auth.js itself (not directly by app code) to compute OAuth callback URLs. Set to your public origin (e.g. `https://yourdomain.com`). |
   | `PORT` | optional | API server listen port (defaults to `8080`). |
   | `FRONTEND_PORT`, `API_ORIGIN` | local dev only | Vite dev port and the dev-proxy target — only consumed by the frontend dev server in `artifacts/microblog`. |

3. **First owner**: the first person to sign in via OAuth becomes a regular `member`. Promote them to `owner` either via the helper script (`npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com`) or directly in SQL: `UPDATE users SET role='owner' WHERE email='you@example.com';`. The owner role is what unlocks the `/settings`, `/admin/feeds`, and `/admin/pending` pages and every `requireOwner`-gated API route.
4. **Customize**: log in as the owner and visit `/settings` to set the site title, hero copy, theme/palette, and color overrides. The schema's seed values in `install.sql` are neutral placeholders meant to be overwritten on first run.
5. **Scheduled feed refresh** (optional, for PESOS): configure a Scheduled Deployment that POSTs to `/api/feed-sources/refresh` with the `X-Cron-Secret` header. See the Scheduled refresh section above.

Adapting it for a different shape of site: the schema is intentionally narrow — there are no per-post tags, categories, or visibility levels beyond `published` / `pending`. Adding any of those is a column on `posts` plus a new `ensureColumn` call in `lib/db/src/migrate.ts` and a matching `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `install.sql`.

## Important Notes

- `@libsql/linux-x64-gnu` must be a direct dependency of `@workspace/api-server` (for esbuild bundling)
- `libsql`, `@libsql/linux-x64-gnu`, and friends are in the esbuild external list in `build.mjs`
- Route order in `posts.ts`: `/feed/stats`, `/posts/user/:userId`, and `/posts/pending` come BEFORE `/posts/:id`. The pending router is mounted before the posts router for the same reason.
- Drizzle operators (`eq`, `desc`, `count`, etc.) are re-exported from `@workspace/db` to avoid version conflicts

Use the root `package.json` workspace configuration for workspace structure, TypeScript setup, and package details.
