// Stage 9B: device/browser notification helpers.
//
// Pure, defensive browser-API wrappers — every function feature-detects
// before touching Notification/localStorage/serviceWorker and never throws
// out of a missing API. No Push API, no VAPID, no backend, and no
// service-worker source/config changes: presentation goes through
// navigator.serviceWorker.ready + registration.showNotification(), which
// works with the existing auto-generated (generateSW) service worker as-is.
//
// This module never requests permission on its own initiative — every
// export here is a plain function the caller invokes; only App.jsx decides
// when (always from a direct user click) to call requestNotificationPermission().

const PREFERENCE_KEY = "takda-notifications-enabled";
const DEDUP_KEY = "takda-notification-dedup";
const DEDUP_MAX_ENTRIES = 200;

export function isNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

// "default" | "granted" | "denied" | "unsupported"
export function getNotificationPermission() {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

// Device-local preference only — never synced, never sent to Supabase.
// Browser permission is always the actual source of truth; this is just
// "did the student choose to turn this on," checked alongside permission.
export function getNotificationsEnabledPreference() {
  try {
    return localStorage.getItem(PREFERENCE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setNotificationsEnabledPreference(enabled) {
  try {
    localStorage.setItem(PREFERENCE_KEY, enabled ? "true" : "false");
  } catch {
    // Storage unavailable (private browsing, quota, disabled) — the toggle
    // just won't persist across reloads on this device; never throw.
  }
}

// Only ever call this from a direct user gesture (a button click).
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

async function getServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

// Uses whatever service worker is already registered for this page — never
// registers, modifies, or replaces it. Returns true only if the browser
// actually accepted the notification.
export async function showDeviceNotification(title, options = {}) {
  const registration = await getServiceWorkerRegistration();
  if (!registration || typeof registration.showNotification !== "function") return false;
  try {
    await registration.showNotification(title, options);
    return true;
  } catch {
    return false;
  }
}

// ---- Deduplication ----
// A single bounded JSON blob in localStorage: { [dedupKey]: timestamp }.
// Once it exceeds DEDUP_MAX_ENTRIES, the oldest entries are pruned so this
// can never grow without bound.

function readDedupStore() {
  try {
    const raw = localStorage.getItem(DEDUP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDedupStore(store) {
  try {
    localStorage.setItem(DEDUP_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable — dedup just won't persist across reloads;
    // never throw.
  }
}

export function hasNotifiedFor(dedupKey) {
  const store = readDedupStore();
  return Boolean(store[dedupKey]);
}

export function markNotifiedFor(dedupKey) {
  const store = readDedupStore();
  store[dedupKey] = Date.now();

  const keys = Object.keys(store);
  if (keys.length > DEDUP_MAX_ENTRIES) {
    keys
      .sort((a, b) => store[a] - store[b])
      .slice(0, keys.length - DEDUP_MAX_ENTRIES)
      .forEach((k) => delete store[k]);
  }

  writeDedupStore(store);
}
