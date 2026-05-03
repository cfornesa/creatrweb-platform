import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import viteThemeInject from "./vite.theme-inject";
import { injectThemeData } from "../api-server/src/lib/meta-injection";

const rawPort = process.env.FRONTEND_PORT ?? "20925";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";
const apiOrigin = process.env.API_ORIGIN ?? `http://localhost:${process.env.PORT ?? "8080"}`;

export default defineConfig({
  base: basePath,
  envDir: path.resolve(import.meta.dirname, "..", ".."),
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    viteThemeInject({
      indexPath: path.resolve(import.meta.dirname, "index.html"),
      injectThemeData,
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiOrigin,
        changeOrigin: false,
      },
      "/feed.xml": {
        target: apiOrigin,
        changeOrigin: false,
      },
      "/feed.json": {
        target: apiOrigin,
        changeOrigin: false,
      },
      "/export.json": {
        target: apiOrigin,
        changeOrigin: false,
      },
      "/export/json": {
        target: apiOrigin,
        changeOrigin: false,
      },
      // Per-category and per-page feed URLs live under the SPA's
      // path namespace (`/categories/:slug/feed.xml`,
      // `/p/:slug/feed.json`, etc). Without these regex proxy
      // entries the dev server hands the request to the SPA, which
      // renders NotFound. The matching API server routes live in
      // `feeds.ts` and produce real Atom/JSON Feed bytes.
      "^/categories/[^/]+/feed\\.(xml|json)$": {
        target: apiOrigin,
        changeOrigin: false,
      },
      "^/p/[^/]+/feed\\.(xml|json)$": {
        target: apiOrigin,
        changeOrigin: false,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
