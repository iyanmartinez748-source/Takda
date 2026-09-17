import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-generated service worker (Workbox) — no custom SW source file
      // to maintain. injectRegister handles registration for us, so
      // src/main.jsx never needs to import or call anything PWA-related.
      strategies: "generateSW",
      registerType: "autoUpdate",
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
      workbox: {
        // Only the static build output (JS/CSS/HTML/icons/manifest) is
        // precached. No runtimeCaching entries are configured anywhere in
        // this file, so Supabase requests (a different origin entirely) and
        // every /api/* serverless endpoint (not part of this static build
        // output in the first place) are never seen or touched by the
        // service worker's fetch handling — they reach the network exactly
        // as if no service worker were installed.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2,webmanifest}"],
        navigateFallback: "/index.html",
        // Defense-in-depth: even though /api/* calls are fetch()-based
        // (not full-page navigations) and would never hit this route,
        // explicitly deny it from ever being served the app-shell fallback.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
