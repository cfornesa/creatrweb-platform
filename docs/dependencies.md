# Dependencies

## Auth.js

- **Purpose:** App-owned authentication layer running inside the existing Express server.
- **Sends data off-domain:** No.
- **What breaks if it changes or is removed:** Local sign-in/session handling breaks until replaced, but content, roles, and authorization data remain local to the app database.
- **Self-hosting alternative:** Not applicable. Auth.js already runs in-repo.

## GitHub OAuth

- **Purpose:** Visitor sign-in using an identity many users already have.
- **Sends data off-domain:** Yes, to GitHub during authentication.
- **What breaks if it changes or is removed:** GitHub sign-in stops working or requires reconfiguration, but local content, users, roles, and non-GitHub sign-in paths remain intact.
- **Self-hosting alternative:** A self-hosted OIDC broker or a future IndieAuth-based flow.

## Google OAuth

- **Purpose:** Visitor sign-in using an identity many users already have.
- **Sends data off-domain:** Yes, to Google during authentication.
- **What breaks if it changes or is removed:** Google sign-in stops working or requires reconfiguration, but local content, users, roles, and non-Google sign-in paths remain intact.
- **Self-hosting alternative:** A self-hosted OIDC broker or a future IndieAuth-based flow.

## Hostinger MySQL

- **Purpose:** Canonical relational datastore for posts, users, comments, reactions, and Auth.js session data across both local and deployed app runtimes.
- **Sends data off-domain:** Yes, when the app connects remotely from a local machine to the hosted MySQL service.
- **What breaks if it changes or is removed:** Publishing, comment writes, authentication persistence, and feed-backed content reads stop working until database connectivity is restored or reconfigured.
- **Self-hosting alternative:** A self-managed MySQL-compatible database or reverting to self-hosted SQLite on infrastructure that guarantees persistent storage outside the deployment build artifact.

## TipTap

- **Purpose:** Rich-text editing for owner-authored posts, including the compact WYSIWYG-style toolbar, heading levels `H1`–`H6`, direct YouTube insertion, and custom embed/media nodes.
- **Sends data off-domain:** No.
- **What breaks if it changes or is removed:** The post composer and editor lose their CMS-style authoring experience until replaced, but stored sanitized HTML content remains in the app database.
- **Self-hosting alternative:** A custom `contenteditable` editor or a different in-repo editor stack.

## sanitize-html

- **Purpose:** Sanitizing author-authored HTML before it is stored and rendered in the Express API.
- **Sends data off-domain:** No.
- **What breaks if it changes or is removed:** Rich post HTML would need a replacement sanitization layer before it can be safely persisted and rendered.
- **Self-hosting alternative:** A custom allowlist sanitizer maintained in-repo.

## rss-parser

- **Purpose:** Fetching and parsing third-party RSS and Atom feeds for the API server's feed-ingest workflow.
- **Sends data off-domain:** Yes, to whatever remote feed URLs the owner configures for ingestion.
- **What breaks if it changes or is removed:** Feed ingestion stops being able to import remote feed items until a replacement parser/fetch pipeline is installed, but the rest of the app remains functional.
- **Self-hosting alternative:** A custom in-repo feed fetcher and RSS/Atom parser maintained as part of the app.

## Local Media Uploads

- **Purpose:** Store uploaded post media files on the app server for insertion into rich posts.
- **Sends data off-domain:** No.
- **What breaks if it changes or is removed:** The rich post editor can no longer accept direct media uploads until replaced with another storage mechanism.
- **Self-hosting alternative:** This is already the self-hosted path. The main future alternative is managed object storage.

## File Type Detection

- **Purpose:** Verify uploaded file types from file signatures instead of trusting browser MIME headers.
- **Sends data off-domain:** No.
- **What breaks if it changes or is removed:** Upload validation would need another magic-byte inspection mechanism before media uploads can stay safely enabled.
- **Self-hosting alternative:** A custom in-repo signature sniffer for the small set of supported media formats.

## Satori & Resvg

- **Purpose:** Generating dynamic Open Graph PNG images for social media previews.
- **Sends data off-domain:** No.
- **What breaks if it changes or is removed:** Post links will fallback to a static generic image when shared on social media.
- **Self-hosting alternative:** This is already the self-hosted path.

## OpenCode Zen

- **Purpose:** Optional owner-enabled AI writing assistance through OpenCode Zen using the owner's saved API key and chosen model slug.
- **Sends data off-domain:** Yes, when the owner explicitly triggers AI from the post editor.
- **What breaks if it changes or is removed:** AI-assisted rewriting for users who selected OpenCode Zen stops working until the adapter is updated or the user switches vendors; the rest of the app remains functional.
- **Self-hosting alternative:** Not permitted for this product direction. Hosted-provider-only.

## OpenCode Go

- **Purpose:** Optional owner-enabled AI writing assistance through OpenCode Go using the owner's saved API key and chosen model slug.
- **Sends data off-domain:** Yes, when the owner explicitly triggers AI from the post editor.
- **What breaks if it changes or is removed:** AI-assisted rewriting for users who selected OpenCode Go stops working until the adapter is updated or the user switches vendors; the rest of the app remains functional.
- **Self-hosting alternative:** Not permitted for this product direction. Hosted-provider-only.

## Google Gemini API

- **Purpose:** Optional owner-enabled AI writing assistance for the Google vendor using the owner's saved Gemini API key.
- **Sends data off-domain:** Yes, when the owner explicitly triggers AI from the post editor.
- **What breaks if it changes or is removed:** AI-assisted rewriting for users who selected Google stops working until the adapter is updated or the user switches vendors; the rest of the app remains functional.
- **Self-hosting alternative:** Not permitted for this product direction. Hosted-provider-only.

## OpenRouter

- **Purpose:** Optional owner-enabled AI writing assistance through OpenRouter using the owner's saved OpenRouter API key and chosen provider-prefixed model slug.
- **Sends data off-domain:** Yes, when the owner explicitly triggers AI from the post editor.
- **What breaks if it changes or is removed:** AI-assisted rewriting for users who selected OpenRouter stops working until the adapter is updated or the user switches vendors; the rest of the app remains functional.
- **Self-hosting alternative:** Not permitted for this product direction. Hosted-provider-only.
- **Routing note:** Uses OpenRouter's official OpenAI-compatible `POST https://openrouter.ai/api/v1/chat/completions` endpoint.

## WordPress.com REST API v1.1

- **Purpose:** POSSE syndication — publishing owner-authored posts to connected WordPress.com blogs via the owner's stored OAuth token.
- **Sends data off-domain:** Yes, to `public-api.wordpress.com` when the owner publishes a post with WordPress.com selected as a syndication target.
- **What breaks if it changes or is removed:** Syndication to WordPress.com stops working or requires adapter updates; posts already published there remain, local content and all other syndication targets are unaffected.
- **Self-hosting alternative:** A self-hosted WordPress instance connected via the self-hosted WordPress adapter (App Passwords, no WordPress.com API involved).

## WordPress Self-Hosted REST API v2

- **Purpose:** POSSE syndication — publishing owner-authored posts to a self-hosted WordPress site via Basic Auth (username + application password).
- **Sends data off-domain:** Yes, to the owner-configured WordPress site URL when the owner publishes a post with self-hosted WordPress selected as a syndication target.
- **What breaks if it changes or is removed:** Syndication to self-hosted WordPress stops working; local content and other syndication targets are unaffected.
- **Self-hosting alternative:** This is already the self-hosted path.

## Medium API v1

- **Purpose:** POSSE syndication — publishing owner-authored posts to a connected Medium account via a self-integration token stored encrypted in the database. Medium deprecated its public OAuth API for new integrations; the app uses a personal self-integration token instead.
- **Sends data off-domain:** Yes, to `api.medium.com` when the owner publishes a post with Medium selected as a syndication target.
- **What breaks if it changes or is removed:** Syndication to Medium stops working or requires adapter updates; posts already published there remain, local content and all other syndication targets are unaffected.
- **Self-hosting alternative:** None. Medium is a closed platform with no self-hosted equivalent.

## Blogger API v3

- **Purpose:** POSSE syndication — publishing owner-authored posts to a connected Blogger blog via the owner's stored Google OAuth token (scoped separately from the sign-in Google OAuth).
- **Sends data off-domain:** Yes, to `www.googleapis.com` when the owner publishes a post with Blogger selected as a syndication target.
- **What breaks if it changes or is removed:** Syndication to Blogger stops working or requires adapter updates; posts already published there remain, local content and all other syndication targets are unaffected.
- **Self-hosting alternative:** None. Blogger is a Google-hosted platform.

## Substack Shadow API

- **Purpose:** POSSE syndication — publishing owner-authored posts directly to a connected Substack publication using the owner's stored session cookie value, publication ID, and publication hostname. The same adapter now supports publish-only web posts and optional publish-and-send newsletter delivery when the Substack composer toggle is selected.
- **Sends data off-domain:** Yes, to `substack.com` when the owner publishes a post with Substack selected as a syndication target.
- **What breaks if it changes or is removed:** Syndication to Substack stops working or requires adapter updates; posts already published there remain, local content and all other syndication targets are unaffected.
- **Self-hosting alternative:** None. Substack is a closed hosted platform and this integration uses an unofficial API surface.
- **Operational note:** This is an unofficial cookie-authenticated integration. The current adapter performs publication-scoped draft and publish writes against the publication hostname and bootstraps publication auth from the saved session before creating drafts. If Substack changes its internal API shape or invalidates the stored session, the app marks the connection as expired and the owner must update credentials in Admin → Platforms.

## turndown

- **Purpose:** Converting rich-post HTML to Markdown before submitting to the Medium API, which accepts Markdown more cleanly than raw HTML.
- **Sends data off-domain:** No. Runs entirely in-process on the API server.
- **What breaks if it changes or is removed:** The Medium adapter would need a replacement HTML-to-Markdown converter; other syndication targets and all local functionality are unaffected.
- **Self-hosting alternative:** A custom in-repo HTML-to-Markdown serializer, or switching Medium posts to plain-text with stripped HTML.
