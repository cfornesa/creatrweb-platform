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
