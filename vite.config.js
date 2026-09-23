import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Phase 9E Stage 9E-1: custom service worker source (src/sw.js),
      // instead of a Workbox auto-generated one — injectManifest is the
      // only strategy that lets a later stage add real `push`/
      // `notificationclick` listeners, which generateSW has no hook for.
      // registerType/the old `workbox` runtime-behavior block are gone
      // because those only apply to generateSW; src/sw.js now reproduces
      // the same precache/navigation-fallback/cache-cleanup/auto-update
      // behavior explicitly (see that file's comments for the mapping).
      // injectRegister still handles registration for us, so src/main.jsx
      // still never needs to import or call anything PWA-related.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      injectRegister: "auto",
      // Disabled in dev so `npm run dev` behaves exactly as before —
      // this phase is about installability, not a new dev-time caching
      // layer to reason about.
      devOptions: { enabled: false },
      includeAssets: ["takda-icon.png", "apple-touch-icon.png"],
      // manifest: false — the web app manifest is authored as a static file
      // (public/manifest.webmanifest) and linked explicitly from index.html
      // instead of being generated/injected by this plugin. The plugin's
      // auto-injection always adds its own <link rel="manifest"> with no way
      // to opt out while still generating the file, which produced a
      // duplicate manifest link once we added an explicit one. Authoring it
      // as a static file guarantees exactly one manifest link in every
      // build, independent of the plugin's HTML-transform behavior.
      manifest: false,
      injectManifest: {
        // Only the static build output (JS/CSS/HTML/icons/manifest) is
        // precached — identical to the previous generateSW globPatterns.
        // No runtimeCaching entries exist anywhere in this file, so
        // Supabase requests (a different origin entirely) and every
        // /api/* serverless endpoint (not part of this static build
        // output in the first place) are never seen or touched by the
        // service worker's fetch handling — they reach the network
        // exactly as if no service worker were installed.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2,webmanifest}"],
      },
    }),
  ],
});
