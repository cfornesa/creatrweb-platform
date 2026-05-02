import satori from "satori";
import { html } from "satori-html";
import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load fonts into memory
const spaceGroteskBold = fs.readFileSync(path.resolve(__dirname, "..", "assets", "fonts", "SpaceGrotesk-Bold.ttf"));
const interRegular = fs.readFileSync(path.resolve(__dirname, "..", "assets", "fonts", "Inter-Regular.ttf"));

export interface OgImageOptions {
  content: string;
  authorName: string;
  authorImageUrl?: string | null;
  createdAt: string;
}

export async function generatePostOgImage(options: OgImageOptions): Promise<Buffer> {
  const { content, authorName, authorImageUrl, createdAt } = options;

  // Simple text truncation for the preview if it's too long
  const truncatedContent = content.length > 280 ? content.substring(0, 277) + "..." : content;
  
  // Format date
  const dateStr = new Date(createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  // Construct the HTML/CSS for the OG image
  // Brutalist Bauhaus Style: Stark borders, primary tricolor accents
  const markup = html`
    <div style="
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: space-between;
      background-color: #FFFFFF;
      border: 24px solid #000000;
      padding: 60px;
      font-family: 'Inter';
    ">
      <!-- Bauhaus Accent Header -->
      <div style="display: flex; width: 100%; margin-bottom: 40px;">
        <div style="height: 20px; width: 80px; background-color: #FF0000; margin-right: 12px; border: 4px solid #000000;"></div>
        <div style="height: 20px; width: 40px; background-color: #FFFF00; margin-right: 12px; border: 4px solid #000000;"></div>
        <div style="height: 20px; flex-grow: 1; background-color: #0000FF; border: 4px solid #000000;"></div>
      </div>

      <div style="display: flex; flex-direction: column; width: 100%;">
        <div style="
          font-size: 48px;
          line-height: 1.2;
          color: #000000;
          margin-bottom: 40px;
          font-family: 'Space Grotesk';
          font-weight: 700;
          word-break: break-word;
        ">
          ${truncatedContent}
        </div>
      </div>

      <div style="display: flex; align-items: center; width: 100%; margin-top: auto;">
        ${authorImageUrl ? `
          <img src="${authorImageUrl}" style="
            width: 80px;
            height: 80px;
            border-radius: 0;
            border: 6px solid #000000;
            margin-right: 24px;
          " />
        ` : `
          <div style="
            width: 80px;
            height: 80px;
            background-color: #FFFF00;
            border: 6px solid #000000;
            margin-right: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            font-weight: 900;
            font-family: 'Space Grotesk';
          ">
            ${authorName.charAt(0).toUpperCase()}
          </div>
        `}
        <div style="display: flex; flex-direction: column;">
          <div style="font-size: 32px; font-weight: 700; font-family: 'Space Grotesk'; color: #000000; text-transform: uppercase;">
            ${authorName}
          </div>
          <div style="font-size: 24px; color: #666666; font-family: 'Inter';">
            ${dateStr}
          </div>
        </div>
        
        <div style="margin-left: auto; display: flex; align-items: center;">
          <div style="
            padding: 8px 16px;
            border: 4px solid #000000;
            background-color: #FF0000;
            color: #FFFFFF;
            font-size: 20px;
            font-weight: 900;
            font-family: 'Space Grotesk';
            text-transform: uppercase;
            letter-spacing: 2px;
          ">
            CREATRWEB
          </div>
        </div>
      </div>
    </div>
  `;

  // Render to SVG
  const svg = await satori(markup as any, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Space Grotesk",
        data: spaceGroteskBold,
        weight: 700,
        style: "normal",
      },
      {
        name: "Inter",
        data: interRegular,
        weight: 400,
        style: "normal",
      },
    ],
  });

  // Convert SVG to PNG
  const resvg = new Resvg(svg, {
    background: "#FFFFFF",
  });
  
  return resvg.render().asPng();
}
