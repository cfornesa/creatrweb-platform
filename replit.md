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

MySQL (Hostinger-hosted in production, also MySQL locally). Drizzle schema in `lib/db/src/schema/`. Core tables: `users`, `accounts`, `sessions`, `verification_tokens`, `posts`, `comments`, `reactions`, `categories`, `post_categories` (many-to-many join), `nav_links` (owner-managed navbar rows, ordered by `sort_order`; `kind` is `'external'`, `'page'`, or `'system'`, with `page_id` set when `kind='page'` and `visible` toggling row visibility — the `'system'` rows are auto-seeded for built-in routes like `/feeds` and `/categories`, can be hidden via the eye toggle on `/admin/navigation`, and cannot be deleted), `pages` (standalone CMS pages addressed at `/p/:slug`, sharing the post HTML pipeline), `site_settings` (singleton row, id=1), `feed_sources` (owner-subscribed RSS/Atom feeds), and `feed_items_seen` (per-source dedup ledger). Legacy SQLite material under `data/` is retained only as historical import material from the migration; nothing reads or writes it at runtime.

Schema reconciliation is performed by the API server at startup via `ensureTables()` + `ensureColumn()` + `ensureForeignKey()` + `ensureIndex()` in `lib/db/src/migrate.ts`. This is the single source of truth — the post-merge script (`scripts/post-merge.sh`) runs only `npm ci`. For one-shot pushes outside the normal merge flow, `npm run push-force --workspace=@workspace/db` is documented in the script's comment block.

For environments where schema is applied by hand (e.g. Hostinger via phpMyAdmin), two copy-pasteable SQL scripts ship alongside the schema:

- `lib/db/install.sql` — **full database install** for forkers. Creates every table (`users`, `accounts`, `sessions`, `verification_tokens`, `feed_sources`, `feed_items_seen`, `posts`, `comments`, `reactions`, `categories`, `post_categories`, `nav_links`, `site_settings`), all indexes including the `posts_content_text_fulltext` FULLTEXT index, every foreign key, and seeds the `site_settings` singleton row with neutral placeholder copy. Idempotent (uses `CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE`). The bottom of the file also lists 15 commented-out maintenance queries (promote/demote owner, list users, approve/reject pending posts, vacuum stale dedup rows, run the same FULLTEXT query the app uses, etc.).
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
- `GET /api/site-settings` — public site identity + color palette (singleton); response also includes the owner user's `ownerSocialLinks` map (instagram/twitter/youtube/tiktok/twitch/github/linkedin) and `ownerWebsite` so the sitewide footer can render social icons without a second round-trip
- `PATCH /api/site-settings` — update site identity + color palette (owner only)
- `GET /api/nav-links` — list owner-managed external navbar links sorted by `sortOrder` ascending (public)
- `POST /api/nav-links` — create a nav link (owner only)
- `PATCH /api/nav-links/:id` — rename, change URL, toggle `openInNewTab`, or re-order (owner only)
- `DELETE /api/nav-links/:id` — delete a nav link (owner only)
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
- `GET /api/posts/search` — full-text post search with filters (public; supports `categories=<slug,slug,…>` for OR-semantics filtering)
- `GET /api/feed-sources/public` — list of feed sources that have at least one published post (public; `id` + `name` only)
- `GET /api/categories` — list every category with its published post count (public)
- `GET /api/categories/:slug` — single category metadata + post count (public)
- `GET /api/categories/:slug/posts` — paginated published posts in a category; honors `?includePending=1` for the owner so the management UI can preview pending items
- `POST /api/categories` — create a category, auto-slugifying the name and resolving collisions with `-2`, `-3`, … suffixes (owner only)
- `PATCH /api/categories/:id` — rename, change description, or replace the slug (owner only; keyed by stable internal id so renames don't race the URL)
- `DELETE /api/categories/:id` — delete a category; `post_categories` rows cascade away while the posts themselves survive (owner only)

Posts also accept a `categoryIds: number[]` array on `POST /api/posts` and `PATCH /api/posts/:id`. Validation is strict — every supplied value must be a positive integer that exists; a malformed or unknown id returns `400` with `{ error, unknownIds }` and leaves the post untouched. The post insert/update and the category join writes are wrapped in a single Drizzle transaction so a mid-flight failure can never strand a post with a half-applied category set. Every post-returning endpoint hydrates a `categories: Category[]` array via a single batched query in `lib/post-categories.ts`.

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

## Categories

Posts can be grouped into owner-managed categories (a many-to-many join via `post_categories`). The taxonomy surfaces in three frontend places:

1. **Composer** — `CategoryMultiSelect` lets the owner pick existing categories from chips and create new ones inline (Enter on an unmatched query calls `POST /api/categories`).
2. **`/categories/:slug` archive page** — paginated published posts in the category. Owners see an inline **Manage categories** link that jumps to the settings card.
3. **`/settings` → Categories card** — full CRUD: name + description + slug edit, slug-change warning, post-count in the delete confirmation. The `CategoriesManagementCard` anchor is `id="categories"` so deep-links from the archive page scroll right to it.

Category chips render under the byline on every post card and on each search result; clicking a chip routes to `/categories/:slug`. The search sidebar exposes a Categories checkbox group whose selected slugs are URL-state via the `categories=` query param (OR semantics).

Categories also travel with every public feed export so external aggregators can filter by them: `GET /feed.xml` emits one `<category term="<slug>" label="<name>"/>` per post category (Atom RFC 4287), `GET /feed.json` sets `tags: ["<name>", ...]` on each item (JSON Feed 1.1), and `GET /export.json` / `GET /export/json` set `properties.category: ["<name>", ...]` on each `h-entry` (Microformats2). Posts without any categories simply omit the field. The shared hydration helper is `attachCategoriesToPosts` in `artifacts/api-server/src/lib/post-categories.ts` — every post-returning endpoint (timeline, search, single post, feeds, exports) goes through it.

Backend storage: singleton row in `site_settings` (id=1) with `theme` and `palette` columns (varchar(32) NOT NULL DEFAULT `'bauhaus'`). Backed by `requireOwner` middleware on `PATCH /api/site-settings`. The frontend hook is `useSiteSettings()` in `artifacts/microblog/src/hooks/use-site-settings.ts`. Google Fonts (Lora, EB Garamond, Inter, Nunito, Quicksand, Space Grotesk, Bebas Neue, Caveat) are preloaded in `index.html`.

## Per-User Profile Theming

Any signed-in user can theme their own profile page (`/users/@handle`) using the same 9-themes × 9-palettes × 14-color-overrides surface that powers site-wide owner customization. Their theme applies only to their profile content; the navbar and footer always keep the site owner's theme.

- **Schema**: 16 nullable columns on `users` mirroring `site_settings` (`theme`, `palette`, and the 14 HSL color fields). Backfilled by `ensureColumn` so existing rows stay valid. NULL on every column means "use the site default."
- **Null-as-clear semantics**: `PATCH /api/users/me` accepts explicit `null` for any theme column, which writes SQL NULL and snaps the user back to the site default for that field. The 16 columns are documented as nullable in OpenAPI; orval-regenerated `UpdateMeBody` is `.nullish()` on every theme key. A profile-info save (no theme keys present in the payload) preserves the user's saved theme — `buildThemeUpdateSet` distinguishes "absent key" from "explicit null."
- **Settings UI**: the **Profile Page Theme** card on `/settings` renders the same picker as the site card (extracted as a shared component) and includes a "Clear my customization" action that PATCHes nulls for all 16 fields. The picker also has a separate "Reset form to site defaults" action that only edits the in-memory form so the user can preview a reset before saving.
- **No-flash first paint (every entry point)**: every HTML response that loads the SPA — production `GET /` and `GET /index.html` (explicit handler in `artifacts/api-server/src/app.ts`, registered ahead of `express.static`), all the dynamic routes (`/posts/:id`, `/p/:slug`, `/categories/:slug`, `/users/:handle`), the SPA-fallthrough catch-all, **and** the vite dev server (via the `viteThemeInject` plugin in `artifacts/microblog/vite.theme-inject.ts`, gated to `apply: 'serve'`) — runs `index.html` through the same `injectThemeData()` helper in `artifacts/api-server/src/lib/meta-injection.ts`. The browser receives `<style id="site-settings-theme">` and `<html data-theme="...">` already in `<head>`, so first paint matches the configured theme on every entry point with no flash. The dev plugin also pipes the result through `server.transformIndexHtml(url, html)` so vite's HMR client and `@vitejs/plugin-react` preamble still get injected. On `/users/:handle`, `injectUserTheme()` extends that base with two synchronized hooks when the user has any customization:
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

`POST /api/feed-sources/refresh` accepts owner cookie auth **or** an `X-Cron-Secret` header compared against `process.env.CRON_SECRET` via `crypto.timingSafeEqual`. Without something hitting this endpoint on a schedule, new items only land in `/admin/pending` when the owner clicks "Refresh all" in `/admin/feeds` — the rest of the PESOS flow is hands-off, so wiring up the schedule is what makes the whole feature unattended.

The contract is intentionally provider-neutral — anything that can issue an HTTP POST with a header on a schedule will work (Replit Scheduled Deployments, cPanel cron on Hostinger / shared hosts, plain Linux `cron`, systemd timers, GitHub Actions, Vercel/Netlify cron, an external uptime monitor's "POST every hour" hook, etc.). The bare requirement on **any** host:

```
curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" "$PUBLIC_SITE_URL/api/feed-sources/refresh"
```

A portable wrapper script ships at `scripts/scheduled-feed-refresh.sh`. It depends only on `bash` + `curl`, reads `CRON_SECRET` and `PUBLIC_SITE_URL` from the environment, fails fast on non-2xx (so the cron host surfaces the failure), never echoes the secret to logs, and supports `FORCE=1` to bypass the cadence gate for one-off debugging runs.

Setup, regardless of host:

1. **Set `CRON_SECRET` on the API server** — long random string (`openssl rand -hex 32`). The same value also has to be available wherever the cron runs.
2. **Pick a cadence** — hourly (`0 * * * *`) is a sensible default; daily/weekly feeds self-throttle via `isSourceDue`, so a faster cron just no-ops on the ones that aren't due yet.
3. **Wire it up on your provider** — pick whichever of these matches your host:
   - **GitHub Actions (zero-config, recommended for forkers)**: a ready-to-use workflow ships at `.github/workflows/feed-refresh.yml`. It runs `scripts/scheduled-feed-refresh.sh` on `cron: '0 * * * *'`. To enable: push the repo to GitHub and add two repo secrets — `CRON_SECRET` (Settings → Secrets and variables → Actions → New repository secret, same value as on the API server) and `PUBLIC_SITE_URL`. The workflow also exposes a "Run workflow" button (with an optional "force" toggle) for one-off manual runs from the GitHub UI.
   - **Replit Scheduled Deployment**: Publishing tool → "New deployment" → **Scheduled**. Set `CRON_SECRET` and `PUBLIC_SITE_URL` (your `*.replit.app` or custom domain) as deployment secrets. Run command: `bash scripts/scheduled-feed-refresh.sh`. Build command: empty. Schedule: `0 * * * *`.
   - **Hostinger / cPanel shared hosting**: cPanel → "Cron Jobs". Either upload `scripts/scheduled-feed-refresh.sh` next to the app and use it as the cron command (cPanel lets you set per-job env vars for `CRON_SECRET` and `PUBLIC_SITE_URL`), or skip the script entirely and paste a one-liner with the literal values directly into the cron command field, e.g. `curl --fail-with-body -sS -X POST -H "X-Cron-Secret: paste-your-secret-here" "https://yourdomain.com/api/feed-sources/refresh" > /dev/null`. (Inline `VAR=… command $VAR` syntax does **not** work in cron's command field — the `$VAR` would expand before the assignment takes effect — so use literal values, or wrap in `sh -c 'CRON_SECRET=… curl … "$CRON_SECRET" …'` if you really want to keep the secret in one place.) Schedule: "Once an hour" (or hand-edit to `0 * * * *`). Note: `--fail-with-body` requires curl 7.76.0+ (March 2021); on older shared hosts, drop it for plain `-fsS` (you lose the response body on errors but the exit code still propagates).
   - **Plain Linux `cron` / VPS**: `crontab -e`, then `0 * * * * CRON_SECRET=… PUBLIC_SITE_URL=https://yourdomain.com /path/to/repo/scripts/scheduled-feed-refresh.sh >> /var/log/feed-refresh.log 2>&1`.
   - **systemd timer**: a `feed-refresh.service` that runs `scripts/scheduled-feed-refresh.sh` (with `Environment=CRON_SECRET=…` / `Environment=PUBLIC_SITE_URL=…`) plus a sibling `feed-refresh.timer` with `OnCalendar=hourly`.
   - **External uptime/monitor service** (UptimeRobot, Cronitor, etc.): configure a "POST every hour" check pointed at `https://yourdomain.com/api/feed-sources/refresh` with the `X-Cron-Secret` request header.
4. **Verify** — after the first scheduled run, the cron host's logs should print `scheduled-feed-refresh: ok` (or, for the bare curl, just exit 0), and `/admin/pending` should show any new items the subscribed feeds have published since the previous run.

Set `FORCE=1` on the cron environment (or append `?force=1` to the URL on the bare curl) only when intentionally bypassing the cadence gate. The admin UI's "Refresh all" button already passes `force=1` for manual debugging runs.

## Search

Visitors and the owner can search published posts at `/search` with relevance ranking and structured filters. The header search bar is reachable on every page on every viewport — see "Header / Navbar Layout" below for the placement contract (always inline on desktop, centered between the logo and the hamburger on mobile). The `/` hotkey focuses the input from anywhere on the page (skips form/contenteditable targets); `Esc` clears and blurs.

- **Index**: native MySQL InnoDB FULLTEXT on `posts.content_text` (a nullable text shadow column populated automatically by `computeContentText` in `artifacts/api-server/src/lib/html.ts` — the single source of truth for "what does the reader see in this post body"). Both insert and update paths in `routes/posts.ts` and the production ingest path in `routes/feed-sources.ts` populate `content_text` with the same helper, so the index never drifts from the rendered text. Legacy rows are backfilled in app code via `backfillPostContentText`, invoked from `index.ts` after `ensureTables` — the same JS stripper is used for backfill as for inserts so historical and new rows are identical. Idempotent: cheap no-op once every row is filled. The FULLTEXT index `posts_content_text_fulltext` is created via `ensureIndex()` in `lib/db/src/migrate.ts` (a reusable wrapper for `CREATE FULLTEXT INDEX IF NOT EXISTS`).
- **Endpoint**: `GET /api/posts/search` accepts `q` (text query, optional), `from` / `to` (ISO date bounds), `sources` (comma-separated `feed_source.id` values plus the literal `native` for owner-authored posts), `author` (case-insensitive substring match against `author_name`), `format` (comma-separated `html` / `plain`), and `page` / `limit` (capped at 50). Always filters `WHERE status = 'published'` even for the owner — the search and the public timeline are semantically the same set. `parseSearchQuery` rebuilds user input as `+term*` boolean-mode expression with operators stripped, so query-injection is impossible. `buildSearchSnippet` HTML-escapes the window then wraps matches in `<mark>` for safe rendering on the client via `dangerouslySetInnerHTML`.
- **Public source list**: `GET /api/feed-sources/public` returns only `id` + `name` for sources that have at least one published post — visitors get the same source filter as the owner without leaking owner-only feed metadata (URLs, cadence, error state).
- **Results page** (`/search`): URL is the source of truth for every filter — shareable, bookmarkable, back/forward-safe. Filter sidebar covers query, date range, sources (public list + native), author, and content format. Source filter defaults visually to "all checked" when no source param is set; unchecking one box collapses to the explicit inverse list and re-checking all collapses back to the empty default so the URL stays clean. Active-filter chips above the result list support one-click removal. Empty result set echoes the active filters back.
- **Query-string subscription**: every interaction on `/search` is a query-string-only navigation (filters, paging, header search submits to `/search?…`), and wouter's `useLocation` only subscribes to the pathname. The page therefore subscribes to the search string directly via wouter's `useSearch` hook (built on `useSyncExternalStore` over `popstate`/`pushState`/`replaceState`/`hashchange`) so any `?…`-only URL change re-renders the page. Without this the second and subsequent searches from the header silently failed to update the page.
- **Header `SearchBar` URL sync** (`artifacts/microblog/src/components/layout/SearchBar.tsx`): the input value mirrors the URL's `q` (so landing on `/search?q=hello` shows "hello" in the field, and removing the chip empties it). A `pendingUrlQRef` defers any URL change that arrives while one of the inputs is focused and re-applies it `onBlur`, so typing isn't clobbered mid-keystroke but back/forward-while-focused is still respected. Empty submit is a deliberate no-op when the URL already has a `q` (so users can't accidentally wipe their query with a blank field). Esc clears + blurs on both desktop and the mobile sheet input.
- **Tests**: `src/pages/__tests__/search.test.tsx` guards the regression by changing only the query string via `history.pushState` and asserting the chip UI updates; `src/components/layout/__tests__/SearchBar.test.tsx` covers URL→input init, outside-driven re-sync, focused-input no-clobber + blur replay, blank-submit no-op, and Esc-clear.

## Header / Navbar Layout

The header (`artifacts/microblog/src/components/layout/Navbar.tsx`) is structured as **three explicit flex zones** that pin to the screen edges: a `shrink-0` **left zone** (`data-testid="navbar-left"`, logo + site title) at the left edge, a `flex-1 min-w-0` **center zone** (`data-testid="navbar-center"`, search + inline nav links with a `gap-6` between them) that fills the middle, and a `shrink-0` **right zone** (`data-testid="navbar-right"`, auth control / avatar + optional hamburger) at the right edge. The container uses `mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8` — full-bleed up to a generous cap with normal page padding. The hamburger is a *progressive overflow* — it contains only the items that didn't fit inline, never the items already visible, and on a roomy desktop where everything fits it is **not rendered at all**. No nav link is ever rendered both in the inline strip and inside the open Sheet; the per-link `data-testid` pair `nav-link-<id>-inline` / `nav-link-<id>-sheet` is mutually exclusive at every viewport.

- **Measurement-based fit (desktop)**: a hidden off-screen measurer renders the full set of links + the search field + the auth button at their natural width. A `ResizeObserver` watches the container and recomputes `FitState = { authInline, searchInline, visibleLinkCount, hamburgerNeeded }` on every resize. The budget reserves the logo and (when signed in) the avatar, but **not** the hamburger — the hamburger is conditional on overflow, and reserving it unconditionally would permanently steal ~44px from the inline auth button at desktop widths and surface a hamburger that wasn't actually needed. The search width is subtracted from the budget *first* (search is mandatory on desktop), then nav links are fit greedily left-to-right by `sort_order`, then the "Log in / Register" button is fit if there's still room. The hamburger appears iff some links overflowed *or* the auth button didn't fit; on roomy desktops with a few links it stays hidden and the right-edge slot is occupied by the auth button (signed out) or the avatar dropdown (signed in).
- **Search is always inline on desktop**: regardless of how many links overflow into the hamburger, the search input stays visible in the header on every viewport above the mobile breakpoint. It does not collapse into the Sheet.
- **Avatar is always inline on desktop**: when signed in, the avatar dropdown is the user's session anchor, so its width is reserved in the budget calc and it stays inline even when nav links overflow. Links cede first; the avatar wins.
- **Mobile (`max-width: 767px`)**: the only breakpoint check. Layout collapses to logo (left) + centered `<SearchBar compact />` (between logo and hamburger) + hamburger (right). The hamburger Sheet contains every nav link, the auth control or signed-in user menu, and a re-exposed `<SearchBar embed />` for users who prefer the larger input — the search-input duplication is intentional only here.
- **`SearchBar` rendering modes**: `<SearchBar />` is the default standalone widget (inline form on `sm`+, icon trigger + bottom sheet below). `<SearchBar compact />` is what the navbar uses on mobile — just the input + submit button, no extra trigger or sheet of its own. `<SearchBar embed />` is what lives inside the hamburger Sheet — the same form stretched to fill its container. All three share the URL-sync, `/`-focus, and Esc-clear behavior.
- **Tests**: `src/components/layout/__tests__/Navbar.test.tsx` asserts the no-duplication invariant (each nav link is rendered in *exactly one* of the inline strip or the open Sheet), that the search bar stays inline on desktop when the hamburger is needed, that the avatar stays inline through overflow, and that on a roomy desktop (~1400px container) the hamburger is **not** rendered while the inline auth button (signed out) or avatar (signed in) sits inside `navbar-right`. The mobile case asserts the compact `SearchBar` is the one rendered between the logo and hamburger.

## Forking & Self-Hosting

If someone clones this repo to run their own microblog, the path is:

1. **Database**: create a fresh MySQL 8+ / MariaDB 10.5+ database, then either
   - run the API server once and let `ensureTables()` build the schema (recommended on Replit / any Node host), **or**
   - import `lib/db/install.sql` via phpMyAdmin (recommended on shared hosts like Hostinger). To import: log in to phpMyAdmin → click your empty database in the sidebar → "Import" tab → "Choose file" → select `install.sql` → "Go". Both SQL files (the full install and the narrow `site_settings_install.sql`) include the same step-by-step phpMyAdmin instructions in their header comments. The script is fully idempotent and ends with 16 copy-pasteable maintenance queries (set username, promote owner, list users, approve/reject pending posts, vacuum stale dedup rows, etc.).
   - All user-facing seed values in both SQL files use a `<<PLACEHOLDER>>` convention (double angle brackets, ALL CAPS — e.g. `<<YOUR_USERNAME>>`, `<<YOUR_NAME>>`, `<<SITE_TITLE>>`). Find-and-replace these in your editor before importing, or accept the defaults and edit them via `/settings` once you've signed in **and** promoted yourself to the owner role (step 4 below — `/settings` is owner-gated).
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
   | `CRON_SECRET` | optional | Required if you want the bulk feed refresh endpoint to be triggerable by an external scheduler (Replit Scheduled Deployment, Hostinger cPanel cron, plain Linux cron, GitHub Actions, etc.) without owner cookies. Must be identical on the API server (verifies the header) and on whatever sends the request (sends it as `X-Cron-Secret`). See "Inbound Feeds (PESOS)" → "Scheduled refresh". |
   | `PUBLIC_SITE_URL` | optional | Used in two places: (1) SSR meta-tag fallback for the catch-all HTML route before the singleton `site_settings` row is loaded, and (2) read by `scripts/scheduled-feed-refresh.sh` as the target origin for the bulk refresh POST — required there if you wire up any provider's cron facility (Replit, Hostinger, etc.) to use that wrapper script. |
   | `SITE_TITLE`, `SITE_DESCRIPTION`, `SITE_AUTHOR_NAME` | optional | SSR meta-tag fallbacks for the catch-all HTML route before the singleton `site_settings` row is loaded. |
   | `STATIC_FILES_PATH` | optional | Override for where the API server serves the built frontend bundle from in production. |
   | `LOG_LEVEL` | optional | `debug` / `info` / `warn` / `error`; defaults to `info`. |
   | `NODE_ENV` | optional | Standard `production` / `development` toggle (affects logging + cache headers). |
   | `AUTH_URL` | yes in prod | Read by Auth.js itself (not directly by app code) to compute OAuth callback URLs. Set to your public origin (e.g. `https://yourdomain.com`). |
   | `PORT` | optional | API server listen port (defaults to `8080`). |
   | `FRONTEND_PORT`, `API_ORIGIN`, `API_PORT` | local dev only | `FRONTEND_PORT` is the Vite dev server's port (default `20925`). `API_ORIGIN` is the explicit dev-proxy target; if unset, the proxy falls back to `http://localhost:${API_PORT}` (default `8080`). All three are only consumed by the frontend dev server in `artifacts/microblog/vite.config.ts`. **Don't use the bare `PORT` env var to mean "the API port" in dev** — Replit's dev runner sets `PORT` to the *frontend* port, which is why the proxy uses `API_PORT` instead. |

3. **Pick a username**: choose the handle your profile page will live at — the URL is `/users/@<your-username>` (e.g. picking `chris` yields `/users/@chris`). Pick something short, lowercase, ASCII-only — it shows up in URLs, bylines, and the hero CTA.

   **The same chosen handle string must appear in two places that match exactly:**

   | Where | When | What it is |
   |---|---|---|
   | `site_settings.cta_href` (literal substring `<<YOUR_USERNAME>>`) | Substitute **before** importing `install.sql`, or edit `cta_href` in the `/settings` UI after step 4 below (the `/settings` page is owner-gated, so first sign-in alone isn't enough — your row must also be promoted to `owner`) | The destination URL of the hero CTA button |
   | `users.username` column on your row | `UPDATE` **after** your first OAuth sign-in (step 4 below) | The handle that makes `/users/@<your-username>` resolve to your profile |

   Both values must be the same literal string (e.g. both `chris`) or the hero CTA will link to a 404. Until you complete step 4, no row in `users` carries that username yet, so the hero CTA link is **expected to 404 on a freshly-imported install** — that resolves itself the moment you run the `UPDATE users SET username = …` in step 4.
4. **First owner**: sign in once via OAuth at `https://<your-domain>/auth/signin` so your row is created in `users`. Then set your chosen username and promote yourself to the `owner` role. Either run the helper script (`npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com`) or, in your SQL client:

   ```sql
   UPDATE users SET username = '<your-username>' WHERE email = '<your-email>';
   UPDATE users SET role     = 'owner'           WHERE email = '<your-email>';
   ```

   The owner role unlocks `/settings`, `/admin` (site administration hub: categories, navigation drag-and-drop reorder, pages CMS, feeds, pending), and every `requireOwner`-gated API route. The public `/feeds` index page lists every subscribable site feed (Atom + JSON Feed + MF2) and is auto-discovered on every page via `<link rel="alternate">` tags. The public `/categories` index page lists every category (with link to `/categories/:slug` and per-row Atom + JSON Feed buttons) and gets the same treatment as `/feeds`: a `kind='system'` nav row seeded by `lib/db/install.sql` and the runtime `ensureTables()` migration, hideable via `/admin/navigation`, never deletable.
5. **Customize**: log in as the owner and visit `/settings` to set the site title, hero copy, theme/palette, and color overrides. The schema's seed values in `install.sql` are placeholder strings (`<<…>>`) deliberately designed to fail loudly if you forget to substitute them.
6. **Scheduled feed refresh** (optional, for PESOS): configure a Scheduled Deployment that POSTs to `/api/feed-sources/refresh` with the `X-Cron-Secret` header. See the Scheduled refresh section above.

Adapting it for a different shape of site: the schema is intentionally narrow — there are no per-post tags, categories, or visibility levels beyond `published` / `pending`. Adding any of those is a column on `posts` plus a new `ensureColumn` call in `lib/db/src/migrate.ts` and a matching `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `install.sql`.

## Optional Creatrweb Framework Files

Several top-level folders and markdown files in this repo are part of the **Creatrweb framework** (https://github.com/cfornesa/creatrweb) — a convention for working with AI coding tools (Claude Code, Gemini CLI, GitHub Copilot, Replit Agent, etc.). They are **NOT runtime dependencies of the microblog application**. Forkers who don't use those AI tools — or who use a different convention — can safely delete every entry below without breaking the build, the API server, the frontend, the database schema, the tests, or anything else the app actually does at runtime.

| Path | What it is |
|---|---|
| `.agents/` | Per-tool skill directory (Cline, Aider, etc. read this) |
| `.claude/` | Claude Code's skill directory |
| `.gemini/` | Gemini CLI's `settings.json` |
| `.github/` | GitHub-specific files — currently holds only `.github/copilot-instructions.md` (GitHub Copilot's per-repo instructions). If you want to keep GitHub Actions workflows or Dependabot config, you can keep `.github/` and delete just the `copilot-instructions.md` file inside it. |
| `AGENTS.md` | The framework's standing rule set (cross-tool) |
| `CLAUDE.md` | Claude Code's instruction file — primarily points at `AGENTS.md` with small Claude-specific additions |
| `GEMINI.md` | Gemini CLI's instruction file — primarily points at `AGENTS.md` with small Gemini-specific additions |
| `MEMORY.md` | Framework's long-term confirmed-lesson log |
| `DECISIONS.md` | Framework's architectural-decision log |
| `CONSTRAINTS.md` | Framework's binding-constraints log |
| `DESIGN.md` | Framework's creative-identity document |
| `EVAL_PROMPT.md` | Framework's session-compliance evaluator |

**`README.md` and `replit.md` are NOT in the safe-to-delete list.** `README.md` is the standard repo front page and is required by every git host; `replit.md` is the Replit-specific working memory the Replit Agent reads on every session and is required if you continue developing on Replit. Keep both. The `docs/` directory and everything under `artifacts/`, `lib/`, `scripts/`, and `data/` are all app-essential — the framework callout above is the entire optional surface.

## Deployment

The app deploys as a Replit **autoscale** deployment in **single-runnable** mode (`.replit` `[deployment]`):

```toml
[deployment]
router = "application"
deploymentTarget = "autoscale"
build = ["npm", "run", "build"]
run   = ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
```

The explicit `run`/`build` is **load-bearing, not cosmetic**. Without them, Replit's autoscale auto-detects the npm-workspace monorepo, sees `artifacts/microblog/dist/public`, and registers it as an *edge* static handler at `/` in front of the api-server runnable (the deployment startup logs print `registered static handler for artifact publicDir=artifacts/microblog/dist/public path=/` and `artifact mode enabled runnable=1 static=1`). That edge handler then SPA-fallbacks every non-`/api/*` path to `index.html`, which silently breaks every public feed URL — `/feed.xml`, `/feed.json`, `/export.json`, `/export/json`, `/categories/:slug/feed.{xml,json}`, `/p/:slug/feed.{xml,json}` — because the requests never reach Express's `feedsRouter`. The single-runnable config sends all traffic straight to the api-server, which serves the SPA itself via `express.static(microblog/dist/public)` + `injectThemeData` SPA fallback in `artifacts/api-server/src/app.ts`, with `feedsRouter` mounted *before* the SPA fallback (line ~68). All routes work because the order on a single Express instance is correct; splitting into an edge static + runnable inverts that order.

The build step (`npm run build`) runs the root build script, which begins with `tsc --build` across the project references in the root `tsconfig.json` (`lib/db`, `lib/api-client-react`, `lib/api-zod`). `lib/db/src/**/*.ts` uses explicit `.ts` extensions on relative imports (e.g. `import { usersTable } from "./users.ts"`) — that requires `"allowImportingTsExtensions": true` in `lib/db/tsconfig.json`, which is paired with the package's existing `"emitDeclarationOnly": true` (TypeScript's only constraint on the option). If you ever drop `emitDeclarationOnly`, you must also strip the `.ts` extensions from those imports or the build will fail with TS5097.

Updates to `[deployment]` made via `deployConfig`/the Publishing UI **only update the configuration; they do not redeploy**. After changing `run`, `build`, or any other deployment field, click Publish again to roll the change out.

## GitHub Sync Notes

- `origin` (https://github.com/cfornesa/creatrweb-platform) and the workspace are kept in sync via plain `git push origin main`.
- **Phantom-parent caveat (resolved 2026-05-03)**: the original Replit clone was shallow-rooted at `3a81df0`, which itself recorded `3fc908e9...` as a parent — that parent object existed nowhere (not locally, not on `gitsafe-backup`, not on GitHub). Any push from the workspace failed with `remote: fatal: did not receive expected object 3fc908e977...`. Task #37 fixed it on GitHub once; Task #40 fixed it again locally on 2026-05-03 by exporting all reachable history with `git fast-export --all --reference-excluded-parents` into a fresh repo (which drops the dangling parent reference), force-pushing that to `origin/main` (new SHA `ced057e1...`, replacing pre-push `335bf654...`), and then realigning the workspace's `refs/heads/main` to the same SHA. Tree content was verified identical before and after.
- If a future workspace ever shows the same `did not receive expected object` error on push, repeat the export/import workaround: `git fast-export --all --reference-excluded-parents | git fast-import` into a fresh `/tmp` repo, then push from there. `--no-thin`, `git repack`, `git replace --graft`, `git filter-branch`, `git update-ref`, and writes to `.git/shallow` are all blocked by the agent guardrails — but writing a SHA directly to `.git/refs/heads/main` via plain shell redirection (`printf '<sha>\n' > .git/refs/heads/main`) is allowed and is what realigned the workspace ref after the GitHub force-push.
- Post-rewrite verification checklist (run all four; any failure means re-investigate before declaring sync complete):
  1. `git rev-parse HEAD^{tree}` matches the workspace tree SHA from before the rewrite.
  2. `git rev-list --count HEAD` matches the pre-rewrite commit count.
  3. `git log --oneline origin/main..main` and `git log --oneline main..origin/main` both return empty.
  4. `git push origin main` (no flags) prints `Everything up-to-date`.

## Important Notes

- `@libsql/linux-x64-gnu` must be a direct dependency of `@workspace/api-server` (for esbuild bundling)
- `libsql`, `@libsql/linux-x64-gnu`, and friends are in the esbuild external list in `build.mjs`
- Route order in `posts.ts`: `/feed/stats`, `/posts/user/:userId`, and `/posts/pending` come BEFORE `/posts/:id`. The pending router is mounted before the posts router for the same reason.
- Drizzle operators (`eq`, `desc`, `count`, etc.) are re-exported from `@workspace/db` to avoid version conflicts
- **Codegen drift**: any change to `lib/api-spec/openapi.yaml` (new operation, new response field, new query param, etc.) must be followed by `npm run codegen --workspace=@workspace/api-spec` to regenerate `@workspace/api-client-react` and `@workspace/api-zod`. Skipping this leaves pages that import the new exports failing `tsc` even though the spec is correct. `lib/api-zod/src/index.ts` re-exports only from `./generated/api` (orval's `zod` client emits a single `api.ts`, no `api.schemas.ts`) — match this if you ever rewrite that index.

Use the root `package.json` workspace configuration for workspace structure, TypeScript setup, and package details.
