// Phase 9E Stage 9E-1: Service Worker Foundation.
//
// Switches Takda's service worker from vite-plugin-pwa's auto-generated
// (generateSW) strategy to a custom source (injectManifest) — the only
// strategy that lets a later Phase 9E stage add real `push`/
// `notificationclick` event listeners. This file is deliberately the
// smallest equivalent of what generateSW was already producing: precache
// the same build output, preserve the same SPA navigation fallback (with
// the same /api/ denylist), and drop old caches on activate. No push or
// notification-content handling is added in this stage — see the
// placeholder at the bottom.
//
// workbox-precaching/workbox-routing/workbox-core are intentionally not
// listed in package.json: they are already resolvable dependencies of
// workbox-build (itself a dependency of vite-plugin-pwa), which is the
// officially documented way vite-plugin-pwa's injectManifest strategy
// expects a custom service worker source to import them. No new
// top-level dependency is required for this stage.
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { clientsClaim } from "workbox-core";

// Equivalent of the previous config's `registerType: "autoUpdate"` — that
// option only applies to the generateSW strategy (it is ignored/
// unsupported under injectManifest), so the same "a new version takes
// over without a manual reload prompt" behavior is reproduced explicitly
// here instead.
self.skipWaiting();
clientsClaim();

// Same behavior the old config's `cleanupOutdatedCaches: true` gave —
// drops any previous version's now-unused precache/runtime caches.
cleanupOutdatedCaches();

// The Workbox build step (workbox-build, via vite-plugin-pwa) replaces the
// precache-manifest placeholder below with the manifest generated from the
// same globPatterns the previous generateSW config used (see
// injectManifest.globPatterns in vite.config.js). workbox-build requires
// that exact placeholder to appear exactly once in this file, so it is
// intentionally never repeated anywhere else, including in comments.
precacheAndRoute(self.__WB_MANIFEST);

// Same SPA fallback the old config's `navigateFallback: "/index.html"` +
// `navigateFallbackDenylist: [/^\/api\//]` provided: every navigation
// request is served the precached app shell, except /api/* requests
// (which are fetch()-based, never full-page navigations, in the first
// place — this denylist is the same defense-in-depth kept from before).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//],
  })
);

// ---------------------------------------------------------------------
// Stage 9E-1 is foundation-only. This custom service worker exists so a
// LATER Phase 9E stage can safely add real-time Web Push support here,
// e.g.:
//
//   self.addEventListener("push", (event) => { ... });
//   self.addEventListener("notificationclick", (event) => { ... });
//
// Neither is implemented yet. This file contains no push subscription
// logic, no VAPID key material, and no notification-content handling.
// ---------------------------------------------------------------------
