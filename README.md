# CreatrWeb

CreatrWeb is an author-owned microblogging application built for publishing short-form posts on a personal site while still allowing lightweight community interaction. The product is centered on one canonical publisher, with authenticated visitors participating through comments and reactions rather than publishing their own primary posts.

The application is split into a React frontend and an Express API, with authentication handled in-app through Auth.js and persistence managed through Drizzle ORM on top of MySQL. It is designed to support direct publishing on your own domain, standardized public feeds, and a clear separation between publishing authority and member participation.

## Overview

This repository contains a TypeScript monorepo with three main layers:

- `artifacts/microblog`: the Vite + React frontend
- `artifacts/api-server`: the Express 5 backend
- `lib/db`: shared database schema and Drizzle configuration

At a high level, the app provides:

- owner-only post publishing and editing
- authenticated member comments and reactions
- owner-managed post categories with public `/categories/:slug` archive pages and search filter
- owner-managed external navigation links and a sitewide footer that surfaces the owner's social profiles
- rich post authoring with sanitized HTML storage
- standardized public feeds and export endpoints, plus public `/feeds` and `/categories` index pages auto-linked from the navbar
- shared publishing through a single canonical MySQL database
- local and deployed app instances operating on the same authoritative content store

## Product-First

### What The App Does

CreatrWeb behaves like a single-author social publishing site. The owner can publish canonical posts, while visitors can sign in and participate around those posts. The site is meant to live on the author's own domain and act as the primary home for published content.

### Roles And Permissions

- `owner`: can create, edit, and delete posts; can upload media; can moderate comments
- `member`: can sign in, comment, and edit their own comments
- unauthenticated visitors: can read the public site and consume its feeds

Publishing authority is intentionally separate from authentication. Logging in does not grant the right to publish posts.

### Post Authoring

The owner can create posts in two formats:

- legacy plain-text posts
- rich posts stored as sanitized HTML

Rich posts support:

- formatting through a toolbar-backed editor
- local image uploads
- owner-trusted `https:` iframe embeds

HTML is sanitized on the server before it is stored, and the frontend renders rich content after that sanitization step.

### Conversation And Interaction

Members can:

- comment on posts
- edit their own comments after posting
- react to content

Comments currently remain plain text even though posts support rich formatting.

### Reading Experience

The homepage acts as the main feed of posts and supports client-side browsing controls such as sorting and filtering. The owner-facing composer is collapsed by default and only expands when the owner chooses to start a post.

### Feeds And Export

The site publishes public machine-readable outputs so content remains accessible outside the main web UI.

- `GET /feed.xml`: Atom feed
- `GET /feed.json`: JSON Feed 1.1
- `GET /export/json`: mf2-JSON export
- `GET /export.json`: compatibility alias retained for stability

Each post in every feed surface carries its categories: Atom emits one `<category term="<slug>" label="<name>"/>` per category, JSON Feed sets `tags: [<name>, ...]`, and the mf2-JSON export sets `properties.category: [<name>, ...]` on each `h-entry`. Posts with no categories simply omit the field. These endpoints are part of the app’s long-term public surface and are intended to remain stable.

### Authentication Model

Authentication is handled by Auth.js in the Express server. The current provider set is:

- GitHub OAuth
- Google OAuth

The first owner account is established by signing in once and then promoting that user in the local database.

### Data Model In Practice

The app stores:

- users and local roles
- Auth.js accounts and sessions
- posts and comments
- reactions

The app now treats one MySQL database as the authoritative store for posts, comments, reactions, users, and Auth.js session data across both local and deployed runtimes.

## Developer-First

### Stack

- TypeScript across the repo
- npm workspaces monorepo
- React 19 + Vite frontend
- Express 5 backend
- Auth.js for authentication
- Drizzle ORM for persistence
- MySQL for storage

### Repository Layout

```text
artifacts/
  api-server/        Express API and auth runtime
  microblog/         React frontend
lib/
  db/                Shared schema and Drizzle config
  api-spec/          OpenAPI source
  api-client-react/  Generated React client
  api-zod/           Generated Zod schemas
scripts/             Admin and maintenance scripts
docs/                Setup and dependency notes
```

### Local Development

Run the one-port development server from the repository root:

```bash
npm run dev
```

The frontend is built first, then the Express server serves the built frontend and all API/Auth routes from one origin. The active origin is shown by the startup log:

```text
Server listening
port: <PORT>
```

For the default local `.env.example`, use `http://localhost:8080`. If you set `PORT=8000`, use `http://localhost:8000`.

For active frontend work with Vite hot reload, use the optional two-port mode:

```bash
npm run dev:hot
```

The lower-level `npm run dev:api` and `npm run dev:web` commands remain available for debugging.

### Environment Variables

Core local variables are documented in [docs/auth-setup.md](./docs/auth-setup.md) and [`.env.example`](./.env.example). The main ones are:

- `PORT`
- `FRONTEND_PORT`
- `API_ORIGIN`
- `ALLOWED_ORIGINS`
- `AUTH_SECRET`
- `GITHUB_ID`
- `GITHUB_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`
- `SQLITE_IMPORT_PATH` for the one-time SQLite import source

Do not set `AUTH_URL` for this Express app. Auth.js derives the request origin from the incoming host and derives `/api/auth` from the Express mount point.

### Scheduled Feed Refresh With GitHub Actions

If you use the included GitHub Actions scheduler for inbound feed refreshes, the workflow lives at `.github/workflows/feed-refresh.yml` and runs `bash scripts/scheduled-feed-refresh.sh` hourly.

The repository needs exactly two GitHub Actions secrets for that workflow:

- `CRON_SECRET`
- `PUBLIC_SITE_URL`

Important wiring details:

- `CRON_SECRET` in GitHub Actions must exactly match the deployed app server's `CRON_SECRET`.
- `PUBLIC_SITE_URL` must be the fully-qualified deployed site origin, for example `https://localhost.com`.
- Use only the origin: include `https://`, omit any path, and omit a trailing slash.
- GitHub Actions does not read your local `.env`; repository secrets and deployed runtime env vars are separate systems.

What success looks like in the workflow logs:

- `scheduled-feed-refresh: ok` means the script ran successfully and the server accepted the request.
- A JSON payload with `attempted: 0` means the scheduler is healthy but no subscribed feed source was due for refresh at that moment.
- `scheduled-feed-refresh: CRON_SECRET is not set` means the GitHub repository secret is missing or empty; it does not mean the deployed app rejected the request.

### Database Behavior

The runtime expects MySQL connection settings and uses one canonical database for both local and deployed app sessions. Local edits and deployed edits are expected to land in the same datastore when they share the same environment configuration.

This means:

- local and deployed app instances can read and write the same canonical content store
- the old SQLite content exists only as migration/recovery material rather than as the intended runtime database

### Owner Bootstrap

After the first successful sign-in, promote the intended site owner using the helper script:

```bash
npm run list-users --workspace=@workspace/scripts
npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com
```

You can also promote by user ID instead of email.

### Build And Typecheck

Useful root commands:

```bash
npm run typecheck
npm run build
npm run start
```

Legacy SQLite import command:

```bash
npm run import-sqlite-to-mysql --workspace=@workspace/scripts
```

### Key Runtime Notes

- Auth.js is mounted under `/auth`
- the backend is the source of truth for authorization
- rich post HTML is sanitized on the server before persistence
- public feed and export routes are part of the stable site surface

## Forking This Repo

If you cloned this repo to run your own microblog, the high-level path is:

1. Stand up a fresh MySQL 8.0+ or MariaDB 10.5+ database. On Replit (or any Node host) the API server's `ensureTables()` builds the schema on first boot. On shared hosts (e.g. Hostinger), import `lib/db/install.sql` via phpMyAdmin — it carries its own step-by-step header comments.
2. Configure environment variables in `.env` (or your host's secrets panel). At minimum: MySQL connection (`DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASS`), `AUTH_SECRET`, and one OAuth provider (`GITHUB_ID`/`GITHUB_SECRET` or `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`). If you want unattended inbound feed refreshes through the included GitHub Actions workflow, also set `CRON_SECRET` on the deployed app and add two GitHub repository secrets: `CRON_SECRET` and `PUBLIC_SITE_URL` (deployed origin only, e.g. `https://yourdomain.com`).
3. **Pick a username** — the handle your profile page will live at, e.g. `chris` → `/users/@chris`. The same chosen string must appear in **two places that match exactly**:
   - `site_settings.cta_href` — substitute the `<<YOUR_USERNAME>>` placeholder in `lib/db/install.sql` *before* importing, or edit `cta_href` in the `/settings` UI after you've completed step 4 below (the `/settings` page is owner-gated, so first sign-in alone isn't enough — you must also promote your row to `owner`).
   - `users.username` — set it with `UPDATE users SET username = '<your-username>' WHERE email = '<your-email>'` *after* you've signed in once via OAuth.

   Both values must be the same literal string. Until the `UPDATE` runs, no user row carries that username yet, so the hero CTA link will 404 — this is expected on a freshly-imported install and resolves the moment you set the username on your row.
4. Sign in once via OAuth, then set your username AND promote yourself to the `owner` role (the role that unlocks `/settings`, `/admin/feeds`, and `/admin/pending`). You can use `npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com` for the promotion.

User-facing seed copy in both SQL files (`install.sql` and the narrow `site_settings_install.sql`) uses a `<<PLACEHOLDER>>` convention — double angle brackets, ALL CAPS (e.g. `<<YOUR_USERNAME>>`, `<<YOUR_NAME>>`, `<<SITE_TITLE>>`) — so a fresh fork visibly says "edit me" instead of shipping someone else's identity. Find-and-replace these in your editor before importing, or accept the placeholders and edit them via `/settings` once you've signed in and promoted yourself to the owner role (step 4).

The full step-by-step (every environment variable, the maintenance-query catalog, scheduled-feed-refresh setup, etc.) lives in [`replit.md`](./replit.md) under "Forking & Self-Hosting".

### Optional Creatrweb framework files

Several top-level folders and markdown files in this repo are part of the **Creatrweb framework** (https://github.com/cfornesa/creatrweb) — a convention for working with AI coding tools (Claude Code, Gemini CLI, GitHub Copilot, Replit Agent, etc.). They are **not runtime dependencies of the application**. Forks that don't use those AI tools can safely delete:

- `.agents/`, `.claude/`, `.gemini/` — per-tool skill / instruction directories
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — agent rule sets (`CLAUDE.md` and `GEMINI.md` primarily point at `AGENTS.md` with small tool-specific additions)
- `MEMORY.md`, `DECISIONS.md`, `CONSTRAINTS.md`, `DESIGN.md`, `EVAL_PROMPT.md` — Creatrweb's long-term-memory and evaluation files

`.github/` is no longer just Copilot metadata in this repo: it also contains the scheduled feed refresh workflow. Keep it if you want the GitHub Actions scheduler path. `README.md` and `replit.md` are **not** in the safe-to-delete list — `README.md` is the standard repo front page; `replit.md` is the Replit-specific working memory and is required if you continue developing on Replit. The `docs/`, `artifacts/`, `lib/`, `scripts/`, and `data/` directories are all app-essential. See `replit.md`'s "Optional Creatrweb Framework Files" section for the full table.

### Related Docs

- [docs/auth-setup.md](./docs/auth-setup.md)
- [docs/dependencies.md](./docs/dependencies.md)
- [DECISIONS.md](./DECISIONS.md)
- [MEMORY.md](./MEMORY.md)
