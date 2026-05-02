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

SQLite file stored at `data/microblog.db` (relative to workspace root). Core tables now include `users`, `accounts`, `sessions`, `verification_tokens`, `posts`, `comments`, `reactions`, and `site_settings` (singleton row, id=1).
Drizzle schema in `lib/db/src/schema/`. Use `npm run push --workspace=@workspace/db` to apply schema changes.

For environments where schema is applied by hand (e.g. Hostinger via phpMyAdmin), a copy-pasteable script for the `site_settings` table is at `lib/db/site_settings_install.sql`. On startup, `ensureTables()` creates this table automatically and seeds a default row with `INSERT IGNORE`, so re-running is safe. The script also includes idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` statements for the `theme` and `palette` columns so older databases can be upgraded in place.

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

## Important Notes

- `@libsql/linux-x64-gnu` must be a direct dependency of `@workspace/api-server` (for esbuild bundling)
- `libsql`, `@libsql/linux-x64-gnu`, and friends are in the esbuild external list in `build.mjs`
- Route order in `posts.ts`: `/feed/stats`, `/posts/user/:userId`, and `/posts/pending` come BEFORE `/posts/:id`. The pending router is mounted before the posts router for the same reason.
- Drizzle operators (`eq`, `desc`, `count`, etc.) are re-exported from `@workspace/db` to avoid version conflicts

Use the root `package.json` workspace configuration for workspace structure, TypeScript setup, and package details.
