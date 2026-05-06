# Microblog

A full-stack microblogging platform enabling users to create, share, and discover content, with robust administration features for owners.

## Run & Operate

- `npm run typecheck`: Type-check all packages.
- `npm run build`: Type-check and build all packages.
- `npm run codegen --workspace=@workspace/api-spec`: Regenerate API hooks and Zod schemas.
- `npm run push --workspace=@workspace/db`: Push DB schema changes (development only).
- `npm run dev`: One-port development run, serving frontend and API/Auth routes from the API server.
- `npm run dev:hot`: Two-port hot-reload workflow for API server and Vite frontend.
- `npm run list-users --workspace=@workspace/scripts`: List local users.
- `npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com`: Promote user to owner role.

**Required Environment Variables:**
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`: MySQL connection details.
- `AUTH_SECRET`: Long random string for Auth.js session signing.
- `GITHUB_ID`, `GITHUB_SECRET` OR `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: OAuth credentials (at least one provider).
- `AI_SETTINGS_ENCRYPTION_KEY`: 32-byte secret for encrypting AI API keys (if AI feature is used).

## Stack

- **Monorepo**: npm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API**: Express 5
- **Database**: MySQL (mysql2) + Drizzle ORM
- **Validation**: Zod (v4), drizzle-zod
- **API Codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild
- **Auth**: Auth.js (GitHub, Google OAuth, local sessions)
- **Frontend**: React + Vite (Tailwind CSS)

## Where things live

- `artifacts/api-server/`: Express API server.
- `artifacts/microblog/`: React + Vite frontend.
- `lib/db/`: Drizzle schema and DB client.
  - Source-of-truth: `lib/db/src/schema/` (DB schema), `lib/db/install.sql` (full DB install script).
- `lib/api-spec/`: OpenAPI 3.1 spec and Orval codegen config.
  - Source-of-truth: `lib/api-spec/openapi.yaml` (API contracts).
- `lib/api-client-react/`: Generated React Query hooks.
- `lib/api-zod/`: Generated Zod request/response schemas.
- `artifacts/microblog/src/index.css`: Theme styles.
- `artifacts/microblog/src/lib/site-themes.ts`: Catalog of themes and palettes.

## Architecture decisions

- **Monorepo Structure**: Uses npm workspaces for a unified development environment for multiple packages, enhancing code sharing and consistency.
- **Single-Runnable Deployment**: The application is deployed as a single runnable to ensure correct routing order for all API endpoints, including feeds, avoiding issues with static asset edge handlers.
- **HTML Sanitization**: All HTML feed bodies are sanitized server-side to prevent XSS attacks, stripping dangerous markup while preserving necessary microformats2 markers.
- **Measurement-based Navbar**: The header dynamically adjusts inline navigation links and search bar visibility based on available width, using a `ResizeObserver` to optimize layout across various desktop screen sizes without a fixed hamburger.
- **Dedicated `content_text` column for Full-Text Search**: A separate, automatically populated `content_text` column on the `posts` table ensures that the MySQL FULLTEXT index is always synchronized with the rendered post body, providing consistent and accurate search results.

## Product

- **Microblogging**: Users can create, view, and comment on posts.
- **User Profiles**: Authenticated users can manage their public identity, including name, username, bio, website, and social links.
- **Site Customization**: Owners can customize site-wide identity, theme, color palette, and individual colors.
- **Per-User Profile Theming**: Signed-in users can personalize their individual profile page's theme, palette, and colors, which applies only to their profile content.
- **Rich Post Editor**: Provides owners with a WYSIWYG editor for posts, supporting text formatting, image uploads, and embedded media (YouTube, generic iframes).
- **Inbound Feeds (PESOS)**: Owners can subscribe to external RSS/Atom feeds, review imported items, and manage their publication status.
- **Full-Text Search**: Provides a search interface for posts with filters for categories, sources, author, and content format.
- **Category Management**: Owners can create, rename, and delete categories for posts.

## User preferences

- _Populate as you build_

## Gotchas

- **MySQL DATETIME**: Use `formatMysqlDateTime()` for app-managed MySQL `DATETIME(3)` writes, not `toISOString()`, to prevent timezone-related display issues.
- **Codegen Drift**: After any change to `lib/api-spec/openapi.yaml`, run `npm run codegen --workspace=@workspace/api-spec` to regenerate API clients and Zod schemas to avoid type errors.
- **Phantom Git Parents**: If `git push` fails with "did not receive expected object", use `git fast-export --all --reference-excluded-parents | git fast-import` into a temporary repo, then force-push to `origin/main` to resolve dangling parent references.
- **Auth.js `AUTH_URL`**: Do not set `AUTH_URL` or `NEXTAUTH_URL` in `.env`; the application derives these values dynamically to prevent OAuth redirect mismatches.

## Pointers

- **Creatrweb Framework**: [https://github.com/cfornesa/creatrweb](https://github.com/cfornesa/creatrweb)
- **OpenAPI Specification**: [https://spec.openapis.org/oas/v3.1.0](https://spec.openapis.org/oas/v3.1.0)
- **Drizzle ORM**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
- **Auth.js Documentation**: [https://authjs.dev/](https://authjs.dev/)
- **React Documentation**: [https://react.dev/](https://react.dev/)
- **Vite Documentation**: [https://vitejs.dev/](https://vitejs.dev/)