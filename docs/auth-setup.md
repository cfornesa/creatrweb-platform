# Auth Setup

## Local Development

Use the one-port development command from the repository root:

```bash
npm run dev
```

The expected local origin is:

- App, API, and Auth.js: `http://localhost:8080`

The frontend is built first, then the API server serves the built frontend and all API/Auth routes from the same origin. This matches the Replit deployment shape and avoids OAuth callback mismatches between frontend and backend ports.

On Replit, use the URL/port that Replit exposes for the running process. The log line `Server listening port: <PORT>` is the source of truth for workspace development. For example, if Replit exposes the app at `https://your-dev-url.replit.dev:8000`, use that origin for workspace testing. Published deployments use the deployment public origin without a dev port.

For active frontend work with Vite hot reload, use the optional two-port mode:

```bash
npm run dev:hot
```

In hot mode, Vite serves the frontend at `http://localhost:3000` and proxies API/Auth routes to the API server at `http://localhost:8080`.

## Required `.env` Values

```env
# Local default only. Do not set PORT in Replit Secrets unless Replit explicitly requires it.
PORT=8080
FRONTEND_PORT=3000
API_ORIGIN=http://localhost:8080
ALLOWED_ORIGINS=http://localhost:8080
AUTH_SECRET=replace_with_a_long_random_secret
GITHUB_ID=your_github_oauth_app_client_id
GITHUB_SECRET=your_github_oauth_app_client_secret
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASS=your_database_password
```

Generate a real auth secret with something like:

```bash
openssl rand -hex 32
```

## Database Setup

- The app expects MySQL connection settings through `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASS`.
- A single canonical MySQL database can be shared by both the deployed app and a local publishing workflow.
- The legacy SQLite file should now be treated as migration or recovery material only, using the optional `SQLITE_IMPORT_PATH` when needed.

## OAuth Callback URLs

Configure these callback URLs in your provider dashboards:

- GitHub: `http://localhost:8080/api/auth/callback/github`
- Google: `http://localhost:8080/api/auth/callback/google`

If you use `npm run dev:hot`, also configure the hot-mode localhost callbacks:

- GitHub: `http://localhost:3000/api/auth/callback/github`
- Google: `http://localhost:3000/api/auth/callback/google`

For Replit workspace development, configure the current Dev URL origin that Replit exposes for the running port. For example, if your workspace app opens at `https://example.replit.dev:8000`, configure:

- GitHub: `https://example.replit.dev:8000/api/auth/callback/github`
- Google: `https://example.replit.dev:8000/api/auth/callback/google`

For published Replit deployments, configure the deployed public origin without a dev port. For example, if your deployment origin is `https://example.replit.app`, configure:

- GitHub: `https://example.replit.app/api/auth/callback/github`
- Google: `https://example.replit.app/api/auth/callback/google`

Do not set `AUTH_URL` for this Express app. Auth.js derives the origin from the request host and derives `/api/auth` from the Express mount point, which keeps local, Replit preview, and deployed origins aligned.

## First Owner Bootstrap

1. Start the backend and frontend.
2. Sign in once with the account you want to own the site.
3. List local users:

```bash
npm run list-users --workspace=@workspace/scripts
```

4. Promote your account:

```bash
npm run promote-owner --workspace=@workspace/scripts -- --email you@example.com
```

You can also promote by user ID:

```bash
npm run promote-owner --workspace=@workspace/scripts -- --id your-user-id
```

## Expected Behavior After Setup

- Signed-in users can keep a stable `username` handle for `/users/@handle` URLs while editing a separate required public display name from `/settings`.
- Signed-in members can comment.
- Signed-in members can edit their own comments after posting.
- The promoted owner can create, edit, and delete posts.
- Owner post composition uses the rich editor with sanitized HTML storage, compact square WYSIWYG-style controls, heading levels `H1`–`H6`, local image uploads, direct YouTube URL insertion, and owner-trusted `https:` iframe embeds.
- The owner-facing Site Customization reset action restores only theme/palette/color values and preserves site copy and links.
- The owner can also moderate comments.

## Public Feed Endpoints

Once the backend and frontend are running, these public feed/export routes should respond without authentication:

- Atom: `http://localhost:4000/api/feeds/atom`
- JSON Feed: `http://localhost:4000/api/feeds/json`
- mf2-JSON export: `http://localhost:4000/api/feeds/mf2`
- Compatibility aliases (also functional): `/atom`, `/jsonfeed`, `/export/json`, `/feed.xml`, `/feed.json`, `/export.json`

On Replit workspace dev, replace `http://localhost:4000` with the Dev URL origin. On published deployments, replace it with the deployed public origin. Note: local port is 4000 (macOS AirPlay Receiver occupies 5000); Replit overrides to 5000 via its workflow.
