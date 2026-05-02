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

For environments where schema is applied by hand (e.g. Hostinger via phpMyAdmin), a copy-pasteable script for the `site_settings` table is at `.local/site_settings_install.sql`. On startup, `ensureTables()` creates this table automatically and seeds a default row with `INSERT IGNORE`, so re-running is safe.

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

## Important Notes

- `@libsql/linux-x64-gnu` must be a direct dependency of `@workspace/api-server` (for esbuild bundling)
- `libsql`, `@libsql/linux-x64-gnu`, and friends are in the esbuild external list in `build.mjs`
- Route order in `posts.ts`: `/feed/stats` and `/posts/user/:userId` come BEFORE `/posts/:id`
- Drizzle operators (`eq`, `desc`, `count`, etc.) are re-exported from `@workspace/db` to avoid version conflicts

Use the root `package.json` workspace configuration for workspace structure, TypeScript setup, and package details.
