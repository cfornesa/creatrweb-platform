import fs from "fs";
import path from "path";
import { db, postsTable, eq } from "@workspace/db";

export async function injectPostMetadata(htmlPath: string, postId: string): Promise<string | null> {
  try {
    const id = parseInt(postId, 10);
    if (isNaN(id)) return null;

    // 1. Fetch post data
    const post = await db.select().from(postsTable).where(eq(postsTable.id, id)).limit(1);
    if (!post[0]) return null;

    // 2. Read the index.html
    let html = fs.readFileSync(htmlPath, "utf-8");

    // 3. Prepare metadata
    const siteUrl = process.env.PUBLIC_SITE_URL || "https://chrisfornesa.com";
    const authorName = post[0].authorName;
    // Strip HTML if it's a rich post for the description
    const description = post[0].contentFormat === 'html' 
      ? post[0].content.replace(/<[^>]*>?/gm, '').substring(0, 200) + "..."
      : post[0].content.substring(0, 200) + (post[0].content.length > 200 ? "..." : "");
    
    const ogImageUrl = `${siteUrl}/api/og/posts/${postId}`;
    const postUrl = `${siteUrl}/posts/${postId}`;

    const metaTags = `
    <!-- Dynamic Social Metadata -->
    <title>Post by ${authorName} | CreatrWeb</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="Post by ${authorName} | CreatrWeb">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImageUrl}">
    <meta property="og:url" content="${postUrl}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Post by ${authorName}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${ogImageUrl}">
    `;

    // 4. Inject before </head>
    html = html.replace("</head>", `${metaTags}\n  </head>`);

    return html;
  } catch (err) {
    console.error("Meta injection failed:", err);
    return null;
  }
}
