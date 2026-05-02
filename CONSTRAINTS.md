# Constraints

<!-- One entry per constraint. Format:
     CONSTRAINT: [plain-language description]
     SCOPE: [what it applies to]
     SET: [date or "this session"]

     Constraints are permanent until explicitly lifted.
     See AGENTS.md → User Constraints for full rules. -->


<!-- An empty file is still valid and still required.
     Absence of entries means no constraints have been stated yet —
     not that this file is optional. The agent must create this
     file at project root the first time any constraint is stated,
     even if AGENTS.md is read-only. -->

CONSTRAINT: Canonical publishing is owner-only. Only the site owner may create posts on the domain unless this rule is explicitly changed later.
SCOPE: Product behavior, permissions, schema, API routes, and UI.
SET: 2026-04-28

CONSTRAINT: Authenticated visitors may engage with the author's ideas through comments and reactions, but they are not general publishers on the site.
SCOPE: Product behavior, permissions, moderation model, and interaction design.
SET: 2026-04-28

CONSTRAINT: Identity and authentication decisions should favor open, portable, and free approaches over centralized paid dependencies whenever feasible.
SCOPE: Auth architecture, vendor evaluation, and dependency selection.
SET: 2026-04-28

CONSTRAINT: v1 authenticated interaction uses GitHub and Google OAuth for sign-in, while authorization and publish permissions remain local to the app.
SCOPE: Auth architecture, permissions, and provider integration.
SET: 2026-04-28

CONSTRAINT: Public user identity routes use local app user IDs rather than third-party provider account IDs.
SCOPE: URL design, API contracts, frontend routing, and data modeling.
SET: 2026-04-28

CONSTRAINT: Initial owner assignment during the Auth.js migration is manual database promotion after the owner's first successful login.
SCOPE: Auth migration, role assignment, and deployment procedure.
SET: 2026-04-28

CONSTRAINT: The initial local capability model is `owner` plus `member`, with no separate moderator role in the first Auth.js migration.
SCOPE: Roles, permissions, schema design, and API authorization.
SET: 2026-04-28

CONSTRAINT: The app uses MySQL as the canonical datastore for both deployed publishing and local authoring workflows; build-scoped SQLite must not be treated as the authoritative runtime database going forward.
SCOPE: Persistence architecture, deployment behavior, local publishing workflow, and migration decisions.
SET: 2026-04-29

CONSTRAINT: Owner-authored rich posts may include iframe embeds from any `https:` source, with the site owner acting as the trust boundary for which embedded origins are acceptable.
SCOPE: Rich post sanitization, publishing workflow, embed rendering, and content trust model.
SET: 2026-04-29
