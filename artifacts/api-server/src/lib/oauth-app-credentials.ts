import { db, platformOAuthAppsTable, eq } from "@workspace/db";
import { decryptSecret } from "./crypto";

/**
 * Resolve OAuth app credentials: env var takes priority, then DB.
 * Used by both the OAuth routes (start/callback) and the adapter
 * token-refresh functions so credentials stored in the DB are respected
 * even when env vars are absent.
 */
export async function getOAuthAppCredentials(
  platform: string,
  envClientId: string | undefined,
  envClientSecret: string | undefined,
): Promise<{ clientId: string; clientSecret: string } | null> {
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }
  const [app] = await db
    .select()
    .from(platformOAuthAppsTable)
    .where(eq(platformOAuthAppsTable.platform, platform))
    .limit(1);
  if (app?.encryptedClientId && app?.encryptedClientSecret) {
    return {
      clientId: decryptSecret(app.encryptedClientId),
      clientSecret: decryptSecret(app.encryptedClientSecret),
    };
  }
  return null;
}
