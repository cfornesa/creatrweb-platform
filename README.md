# CreatrWeb

CreatrWeb is an author-owned microblogging application built for publishing short-form posts on a personal site while still allowing lightweight community interaction. The product is centered on one canonical publisher, with authenticated visitors participating through comments and reactions rather than publishing their own primary posts.

The application is split into a React frontend and an Express API, with authentication handled in-app through Auth.js and persistence managed through Drizzle ORM on top of MySQL. It supports direct publishing on your own domain, standardized public feeds, POSSE outbound syndication to external platforms, inbound feed aggregation, and a clear separation between publishing authority and member participation.

## Overview

This repository is a TypeScript monorepo with three main layers:

- `artifacts/microblog`: the Vite + React frontend
- `artifacts/api-server`: the Express 5 backend
- `lib/db`: shared database schema and Drizzle configuration

At a high level, the app provides:

- owner-only post publishing and editing with a rich WYSIWYG editor
- POSSE outbound syndication to WordPress.com, self-hosted WordPress, Medium, and Blogger, with per-post syndication badges on post cards
- inbound feed aggregation (PESOS) — subscribe to external RSS/Atom feeds and import posts for review
- authenticated member comments and reactions
- owner-managed post categories with public archive pages and search filtering
- owner-managed external navigation links and a sitewide footer surfacing the owner's social profiles
- standardized public feeds (Atom, JSON Feed, mf2-JSON) and per-category/per-page feed variants
- AI-assisted post rewriting (optional, owner-configured) via OpenRouter, OpenCode Zen, OpenCode Go, or Google Gemini
- a single canonical MySQL database shared by local and deployed app instances

## Product

### Roles And Permissions

- `owner`: can create, edit, and delete posts; upload media; moderate comments; manage categories, nav links, feeds, and platform connections
- `member`: can sign in, comment, and edit their own comments
- unauthenticated visitors: can read the public site and consume its feeds

Publishing authority is intentionally separate from authentication. Logging in does not grant the right to publish posts.

### Post Authoring

The owner creates posts in two formats:

- legacy plain-text posts
- rich posts stored as sanitized HTML

Rich posts support:

- formatting through a compact WYSIWYG-style toolbar with square controls
- heading levels `H1` through `H6`
- local image uploads
- direct YouTube URL insertion that converts a watch/share link into an embedded video
- owner-trusted `https:` iframe embeds
- optional AI-assisted rewrite from the composer and edit flow, once the owner configures vendors in `/admin/ai`

HTML is sanitized on the server before storage. The frontend renders rich content after that sanitization step.

### Outbound Syndication (POSSE)

The owner can cross-post to external platforms from the post composer. Supported targets:

| Platform | Auth method |
|---|---|
| WordPress.com | OAuth 2.0 (CLIENT_ID + CLIENT_SECRET stored in DB) |
| WordPress (self-hosted) | Application password |
| Medium | Self-integration token |
| Blogger | Google OAuth 2.0 (CLIENT_ID + CLIENT_SECRET stored in DB) |

OAuth app credentials (CLIENT_ID + CLIENT_SECRET) are stored encrypted in the database via `/admin/platforms` — no server-side environment variable required. The encryption key is `AI_SETTINGS_ENCRYPTION_KEY`.

After a post is cross-posted successfully, its card on the home feed shows platform badges ("Also on Medium", "Also on WordPress.com", etc.) linking to the syndicated copy.

### Inbound Feed Aggregation (PESOS)

The owner can subscribe to external RSS or Atom feeds from `/admin/feeds`. Imported items appear in a pending queue for review before publication. The scheduled refresh runs hourly via the included GitHub Actions workflow.

### Reading Experience

The homepage is the main post feed. Four browsing controls sit above the post list: **Sort** (newest / oldest / most-commented), **Filter** (has comments / has media / rich posts), **Category** (All Categories, Uncategorized, or any named category), and **Source** (All Sources, Original, or any named feed source). Category and Source filtering is server-side — selecting a value queries the full post archive rather than a fixed in-memory window — so no matching post is ever hidden by a pagination limit.

The owner-facing composer is collapsed by default and only expands when the owner starts a post.

### Feeds And Export

Primary endpoints (proxy-safe, under `/api`):

- `GET /api/feeds/atom` — Atom feed
- `GET /api/feeds/json` — JSON Feed 1.1
- `GET /api/feeds/mf2` — mf2-JSON export
- `GET /api/categories/:slug/feeds/atom` — per-category Atom
- `GET /api/categories/:slug/feeds/json` — per-category JSON Feed
- `GET /api/p/:slug/feeds/atom` — per-page Atom
- `GET /api/p/:slug/feeds/json` — per-page JSON Feed

Backward-compatible aliases (retained for stability):

- `GET /atom`, `/feed.xml` → Atom feed
- `GET /jsonfeed`, `/feed.json` → JSON Feed
- `GET /export/json`, `/export.json` → mf2-JSON
- `GET /categories/:slug/atom`, `/categories/:slug/jsonfeed` → per-category feeds
- `GET /p/:slug/atom`, `/p/:slug/jsonfeed` → per-page feeds

These endpoints are part of the app's long-term stable surface.

### Pages

The owner can create static pages at `/admin/pages`. Published pages are available at `/p/:slug` and can optionally appear in the navigation.

### Authentication

Authentication is handled by Auth.js. Supported sign-in providers:

- GitHub OAuth
- Google OAuth

The first owner account is established by signing in once and then promoting that user with the bootstrap script.

### Optional AI Writing Assistant

Configured per vendor from `/admin/ai`. Supported vendors:

- OpenRouter (provider-prefixed model slug, e.g. `anthropic/...`)
- OpenCode Zen
- OpenCode Go
- Google Gemini

AI is owner-only and disabled per vendor by default. Saved API keys are encrypted at rest using `AI_SETTINGS_ENCRYPTION_KEY`. See [docs/ai-vendor-verification.md](./docs/ai-vendor-verification.md) before treating any vendor as production-ready.

### Admin Pages

| Path | Purpose |
|---|---|
| `/admin/posts` | Manage posts and pending feed imports |
| `/admin/categories` | Create and manage post categories |
| `/admin/platforms` | Connect and configure outbound syndication platforms |
| `/admin/feeds` | Manage inbound feed subscriptions |
| `/admin/ai` | Configure AI writing assistant vendors |
| `/admin/pages` | Create and manage static pages |
| `/settings` | Site customization (theme, palette, colors, site copy) |

## Developer

### Stack

- TypeScript across the repo
- npm workspaces monorepo
- React 19 + Vite frontend
- Express 5 backend
- Auth.js for authentication
- Drizzle ORM + MySQL for persistence
- Orval for OpenAPI → React Query + Zod codegen

### Repository Layout

```text
artifacts/
  api-server/        Express API and auth runtime
  microblog/         React frontend
lib/
  db/                Shared schema, Drizzle config, and migration runner
  api-spec/          OpenAPI 3.1 source (openapi.yaml)
  api-client-react/  Generated React Query hooks
  api-zod/           Generated Zod schemas
scripts/             Admin and maintenance scripts
docs/                Setup and dependency notes
```

### Local Development

Run the one-port development server from the repository root:

```bash
npm run dev
```

The frontend is built first, then Express serves both the built frontend and all API/Auth routes from one origin. For the default local `.env` (`PORT=4000`), the app runs at `http://localhost:4000`.

> macOS's AirPlay Receiver occupies port 5000, so the default local port is 4000.

For active frontend work with Vite hot reload:

```bash
npm run dev:hot
```

### Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `PORT` | Yes | API server port. Default `4000` locally. |
| `ALLOWED_ORIGINS` | Yes | Comma-separated origins allowed for CORS and used to generate OAuth callback URLs in the admin UI. |
| `AUTH_SECRET` | Yes | Long random string for Auth.js session signing. |
| `GITHUB_ID` / `GITHUB_SECRET` | One provider required | GitHub OAuth sign-in. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | One provider required | Google OAuth sign-in (for Auth.js login, separate from Blogger syndication). |
| `DB_HOST` | Yes | MySQL host. |
| `DB_PORT` | No | MySQL port. Default `3306`. |
| `DB_NAME` | Yes | MySQL database name. |
| `DB_USER` | Yes | MySQL user. |
| `DB_PASS` | Yes | MySQL password. |
| `DB_SSL` | No | Set to `true` to enable SSL for the MySQL connection (required for most hosted MySQL providers). |
| `AI_SETTINGS_ENCRYPTION_KEY` | Yes | 32-byte secret used to encrypt AI API keys **and** platform OAuth app credentials at rest. |
| `CRON_SECRET` | For scheduled feeds | Must match the GitHub Actions secret of the same name. |
| `SESSION_SECRET` | Yes | Session signing secret. |

Generate `AI_SETTINGS_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> Do not set `AUTH_URL`. Auth.js derives the request origin from the incoming host and the Express mount point.

### Schema Changes

The API server runs `ensureTables()` automatically on every startup via `lib/db/src/migrate.ts`. New tables and columns are applied with `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — no manual migration step is required after a code pull.

For interactive schema inspection during development:

```bash
DB_HOST=... DB_USER=... DB_PASS=... DB_NAME=... DB_SSL=true npm run push-force --workspace=lib/db
```

After any change to `lib/api-spec/openapi.yaml`, regenerate API clients:

```bash
npm run codegen --workspace=lib/api-spec
```

### Scheduled Feed Refresh With GitHub Actions

The workflow at `.github/workflows/feed-refresh.yml` runs `bash scripts/scheduled-feed-refresh.sh` hourly. Two GitHub Actions secrets are required:

- `CRON_SECRET` — must exactly match the deployed app's `CRON_SECRET`
- `PUBLIC_SITE_URL` — fully-qualified deployed site origin, e.g. `https://yourdomain.com` (no trailing slash)

### Owner Bootstrap

After the first successful sign-in, promote the intended site owner:

```bash
npm run list-users --workspace=@workspace/scripts
npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com
```

### Build And Typecheck

```bash
npm run typecheck   # type-check all packages
npm run build       # build all packages
npm run start       # start the built API server
```

## Forking And Self-Hosting

1. **Database** — stand up a MySQL 8.0+ or MariaDB 10.5+ database. The API server's `ensureTables()` builds the full schema on first boot.

2. **Environment variables** — at minimum: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_SSL` (if your host requires it), `ALLOWED_ORIGINS` (set to your production domain), `AUTH_SECRET`, `AI_SETTINGS_ENCRYPTION_KEY`, and at least one OAuth sign-in provider. See the table above.

3. **Username** — the handle your profile page lives at, e.g. `chris` → `/users/@chris`. Set it in two places:
   - `site_settings.cta_href` — edit via `/settings` after you've promoted yourself to owner
   - `users.username` — run `UPDATE users SET username = '<your-username>' WHERE email = '<your-email>'` after signing in, or use `/settings`

4. **Sign in and promote** — sign in once via OAuth, then promote yourself:

   ```bash
   npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com
   ```

5. **Platform syndication** — visit `/admin/platforms` to connect external publishing targets. WordPress.com and Blogger require an OAuth app registered in their respective developer consoles. The admin UI generates the exact redirect URIs to register, derived from your `ALLOWED_ORIGINS` value. Medium requires a self-integration token from your Medium account settings.

### Optional Creatrweb Framework Files

Several top-level files in this repo are part of the **Creatrweb framework** — conventions for working with AI coding tools (Claude Code, Gemini CLI, GitHub Copilot, Replit Agent). They are not runtime dependencies. Forks that don't use those tools can safely delete:

- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — agent rule sets
- `MEMORY.md`, `DECISIONS.md`, `CONSTRAINTS.md`, `DESIGN.md`, `EVAL_PROMPT.md` — long-term memory and evaluation files
- `.agents/`, `.claude/`, `.gemini/` — per-tool skill directories

`.github/` is not safe to delete if you want the scheduled feed refresh workflow. `README.md`, `replit.md`, `docs/`, `artifacts/`, `lib/`, and `scripts/` are all app-essential.

## Related Docs

- [docs/auth-setup.md](./docs/auth-setup.md) — OAuth callback setup and first-boot walkthrough
- [docs/ai-vendor-verification.md](./docs/ai-vendor-verification.md) — AI vendor verification checklist
- [docs/dependencies.md](./docs/dependencies.md) — runtime dependency registry
- [DECISIONS.md](./DECISIONS.md) — architecture decision log
