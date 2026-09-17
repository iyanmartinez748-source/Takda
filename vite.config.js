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
      manifest: {
        name: "Takda — Student Academic Planner",
        short_name: "Takda",
        description:
          "A student academic planner for managing subjects, activities, deadlines, notes, calendar, and grades.",
        start_url: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#F5F6FA",
        theme_color: "#3D2FE0",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Only the static build output (JS/CSS/HTML/icons) is precached.
        // No runtimeCaching entries are configured anywhere in this file,
        // so Supabase requests (a different origin entirely) and every
        // /api/* serverless endpoint (not part of this static build output
        // in the first place) are never seen or touched by the service
        // worker's fetch handling — they reach the network exactly as if
        // no service worker were installed.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
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
