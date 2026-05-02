import fs from "fs";
import { db, postsTable, siteSettingsTable, eq, siteSettingsDefaults } from "@workspace/db";

const KNOWN_THEMES = new Set([
  "bauhaus",
  "traditional",
  "minimalist",
  "academic",
  "airy",
  "nature",
  "comfort",
  "audacious",
  "artistic",
]);

type PartialSettings = {
  theme?: string | null;
  colorBackground?: string | null;
  colorForeground?: string | null;
  colorBackgroundDark?: string | null;
  colorForegroundDark?: string | null;
  colorPrimary?: string | null;
  colorPrimaryForeground?: string | null;
  colorSecondary?: string | null;
  colorSecondaryForeground?: string | null;
  colorAccent?: string | null;
  colorAccentForeground?: string | null;
  colorMuted?: string | null;
  colorMutedForeground?: string | null;
  colorDestructive?: string | null;
  colorDestructiveForeground?: string | null;
  siteTitle?: string | null;
};

function buildThemeInjection(settings: PartialSettings): { themeId: string; css: string } {
  const s = { ...siteSettingsDefaults, ...settings };
  const themeId = s.theme && KNOWN_THEMES.has(s.theme) ? s.theme : "bauhaus";

  const css = `:root {
  --background: ${s.colorBackground};
  --foreground: ${s.colorForeground};
  --card: ${s.colorBackground};
  --card-foreground: ${s.colorForeground};
  --popover: ${s.colorBackground};
  --popover-foreground: ${s.colorForeground};
  --primary: ${s.colorPrimary};
  --primary-foreground: ${s.colorPrimaryForeground};
  --secondary: ${s.colorSecondary};
  --secondary-foreground: ${s.colorSecondaryForeground};
  --accent: ${s.colorAccent};
  --accent-foreground: ${s.colorAccentForeground};
  --muted: ${s.colorMuted};
  --muted-foreground: ${s.colorMutedForeground};
  --destructive: ${s.colorDestructive};
  --destructive-foreground: ${s.colorDestructiveForeground};
  --input: ${s.colorBackground};
  --ring: ${s.colorSecondary};
}
.dark {
  --background: ${s.colorBackgroundDark};
  --foreground: ${s.colorForegroundDark};
  --card: ${s.colorBackgroundDark};
  --card-foreground: ${s.colorForegroundDark};
  --popover: ${s.colorBackgroundDark};
  --popover-foreground: ${s.colorForegroundDark};
  --primary: ${s.colorPrimary};
  --primary-foreground: ${s.colorPrimaryForeground};
  --secondary: ${s.colorSecondary};
  --secondary-foreground: ${s.colorSecondaryForeground};
  --accent: ${s.colorAccent};
  --accent-foreground: ${s.colorAccentForeground};
  --muted: ${s.colorMuted};
  --muted-foreground: ${s.colorMutedForeground};
  --destructive: ${s.colorDestructive};
  --destructive-foreground: ${s.colorDestructiveForeground};
  --input: ${s.colorBackgroundDark};
  --ring: ${s.colorSecondary};
}`;

  return { themeId, css };
}

async function loadSettings(): Promise<PartialSettings> {
  try {
    const rows = await db
      .select()
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.id, 1))
      .limit(1);
    return rows[0] ?? {};
  } catch {
    return {};
  }
}

function applyThemeToHtml(html: string, themeId: string, css: string): string {
  html = html.replace(
    /(<html\b[^>]*?)(?:\s+data-theme="[^"]*")?(\s*>)/,
    `$1 data-theme="${themeId}"$2`,
  );
  html = html.replace(
    "</head>",
    `  <style id="site-settings-theme">${css}</style>\n  </head>`,
  );
  return html;
}

export async function injectThemeData(htmlPath: string): Promise<string> {
  const html = fs.readFileSync(htmlPath, "utf-8");
  try {
    const settings = await loadSettings();
    const { themeId, css } = buildThemeInjection(settings);
    return applyThemeToHtml(html, themeId, css);
  } catch (err) {
    console.error("Theme injection failed:", err);
    return html;
  }
}

export async function injectPostMetadata(htmlPath: string, postId: string): Promise<string | null> {
  try {
    const id = parseInt(postId, 10);
    if (isNaN(id)) return null;

    const post = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    if (!post[0]) return null;

    const settingsRows = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1)).limit(1);
    const settings: PartialSettings = settingsRows[0] ?? {};
    const siteTitle = settings.siteTitle ?? "Microblog";
    const siteUrl = process.env.PUBLIC_SITE_URL || "https://chrisfornesa.com";
    const authorName = post[0].authorName;
    const description = post[0].contentFormat === "html"
      ? post[0].content.replace(/<[^>]*>?/gm, "").substring(0, 200) + "..."
      : post[0].content.substring(0, 200) + (post[0].content.length > 200 ? "..." : "");

    const ogImageUrl = `${siteUrl}/api/og/posts/${postId}`;
    const postUrl = `${siteUrl}/posts/${postId}`;

    const metaTags = `
    <!-- Dynamic Social Metadata -->
    <title>Post by ${authorName} | ${siteTitle}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="Post by ${authorName} | ${siteTitle}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImageUrl}">
    <meta property="og:url" content="${postUrl}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Post by ${authorName}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${ogImageUrl}">
    `;

    let html = fs.readFileSync(htmlPath, "utf-8");

    const { themeId, css } = buildThemeInjection(settings);
    html = applyThemeToHtml(html, themeId, css);

    html = html.replace("</head>", `${metaTags}\n  </head>`);

    return html;
  } catch (err) {
    console.error("Meta injection failed:", err);
    return null;
  }
}
