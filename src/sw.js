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
// Phase 9E Stage 9E-3B: Web Push receipt. This file still contains no
// push SUBSCRIPTION logic (that's src/lib/push.js, Stage 9E-2) and no
// VAPID key material of any kind (that's api/test-push.js, Stage 9E-3A,
// server-only) — this is purely "what happens when a push we already
// agreed to receive actually arrives."
//
// resolveSameOriginUrl guards notificationclick's only external input:
// a URL named IN the push payload itself. A push payload is produced by
// our own server today (api/test-push.js's fixed test payload), but this
// handler must still never blindly trust a URL string just because it
// arrived inside a push message — only ever navigate/open a same-origin
// Takda URL, falling back to the app root for anything else (missing,
// malformed, or a different origin entirely).
function resolveSameOriginUrl(rawUrl) {
  try {
    const resolved = new URL(rawUrl || "/", self.location.origin);
    if (resolved.origin !== self.location.origin) {
      return `${self.location.origin}/`;
    }
    return resolved.href;
  } catch {
    return `${self.location.origin}/`;
  }
}

// Every push message is a small, trusted-shape JSON payload (see
// api/test-push.js: currently always { title, body }, no "url" field
// yet — resolveSameOriginUrl's "/" fallback already covers that). Parsing
// is defensive regardless: a missing/malformed event.data must never
// throw out of this handler and silently drop the notification.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = typeof data.title === "string" && data.title ? data.title : "Takda";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/takda-icon.png",
    data: { url: resolveSameOriginUrl(data.url) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Focuses an already-open Takda window/tab if one exists (regardless of
// which page it's currently on — this stage's test notification has
// nothing more specific to navigate to yet); otherwise opens the
// same-origin URL resolved above. Never opens/focuses anything
// cross-origin.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || `${self.location.origin}/`;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
// ---------------------------------------------------------------------
