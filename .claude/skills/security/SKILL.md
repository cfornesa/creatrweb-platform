---
name: security
description: IndieWeb endpoint security requirements for Webmention, IndieAuth, Micropub, and media upload handlers.
trigger: Writing any Webmention, IndieAuth, Micropub, or media upload handler.
---

# Security

Apply these requirements to every handler in scope. None are optional.

## Webmention
- Validate asynchronously — never block the HTTP response on verification.
- Sanitize all external `e-content` before display. Treat it as untrusted HTML.

## IndieAuth
- PKCE is mandatory. No JWTs as tokens.
- Exact `redirect_uri` match required — no prefix matching, no wildcards.

## Micropub
- Verify `delete` scope explicitly before any destructive action.
- Do not infer delete permission from write scope.

## Media Uploads
- Validate MIME type by magic bytes, not `Content-Type` header.
- Serve uploaded files outside `public/` or `static/`. Never serve from a
  path the web server exposes directly.

## All Inbound Endpoints
- Rate-limit every inbound endpoint.
- Implement in `lib/ratelimit.ts` or `app/utils/ratelimit.py`.
  Create the file if absent, following the active framework profile in
  DECISIONS.md.

## Pre-Write Reminder
Before writing any handler covered by this skill, confirm:
- Is this endpoint in the Irreversible Decisions table in AGENTS.md?
  If yes, stop and get explicit sign-off before proceeding.
- Does `docs/dependencies.md` need updating for any new package this
  handler introduces?