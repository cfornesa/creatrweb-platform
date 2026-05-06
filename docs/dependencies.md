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

- **Purpose:** Rich-text editing for owner-authored posts, including toolbar-driven formatting and custom embed/media nodes.
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
