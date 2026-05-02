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

