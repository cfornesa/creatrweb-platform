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

