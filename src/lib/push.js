// Phase 9E Stage 9E-2: Web Push subscription foundation.
//
// Pure, defensive browser-API wrapper — every function feature-detects
// before touching PushManager/serviceWorker and never throws out of a
// missing/unsupported API. Subscribing here only PERSISTS a
// PushSubscription for a LATER stage to read; nothing in this file ever
// sends a push message, schedules anything, or talks to a server-side
// sending endpoint (none exists yet).
//
// Mirrors src/lib/notifications.js's separation of concerns: that module
// owns foreground Notification permission/delivery/dedup; this module
// owns background PushSubscription capture/persistence only. Neither
// file depends on the other, and this stage does not change how
// notifications.js is used anywhere.

import { supabase } from "./supabase";

// The PUBLIC VAPID key only — safe to ship to the browser; it identifies
// this app to the push service, which is exactly what VAPID public keys
// are designed for. The PRIVATE key is never read, referenced, or
// reachable from this file or from any other client-bundled code — it
// will only ever exist in a server-side env var for a future sending
// stage. Vite only bundles VITE_-prefixed vars into client code, so
// simply never prefixing the private key with VITE_ keeps it server-only,
// the same convention already used for PAYMONGO_SECRET_KEY/
// SUPABASE_SERVICE_ROLE_KEY vs. the intentionally-prefixed
// VITE_SUPABASE_URL. Until VITE_VAPID_PUBLIC_KEY is configured, every
// export below safely no-ops instead of throwing.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Web Push's applicationServerKey must be a Uint8Array; VAPID public keys
// are distributed as URL-safe base64. Standard, dependency-free
// conversion — no package is needed for this.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

// Upsert on conflict(endpoint) — re-points ownership to the current
// userId on an account switch on the same device (same endpoint, new
// user_id) instead of ever creating a duplicate row. See the
// push_subscriptions migration's endpoint-uniqueness comment for why
// uniqueness is scoped to endpoint alone rather than (user_id, endpoint).
async function persistSubscription(subscription, userId) {
  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth_key: json.keys?.auth,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
}

// Full subscribe lifecycle (Stage 9E-2 architecture audit): the caller is
// responsible for already having confirmed Notification permission is
// granted and the device-local Takda notification preference is on —
// this function only handles the PushManager/Supabase mechanics, and is
// always safe to call. It no-ops (returns false) on any unsupported
// browser, missing authenticated user, or missing public key, rather
// than throwing into the caller's UI — progressive enhancement, never a
// regression to the existing foreground-only behavior.
export async function subscribeToPush() {
  if (!isPushSupported()) return false;
  if (!VAPID_PUBLIC_KEY) return false;

  const userId = await getAuthenticatedUserId();
  if (!userId) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    // Reuse an already-active browser subscription for this device
    // whenever one exists, instead of creating a second one.
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await persistSubscription(subscription, userId);
    return true;
  } catch {
    return false;
  }
}

// Stage 9E-3C: calls the Stage 9E-3A server endpoint (POST /api/test-push)
// to send ONE real Web Push notification to this account's own registered
// device(s) — the missing frontend trigger for the background delivery
// path proven out manually in 9E-3A/9E-3B. Owns the session/fetch
// mechanics here, mirroring this file's existing separation of concerns;
// never throws — always resolves to a plain result object for the caller
// to render. No VAPID key material of any kind is read, referenced, or
// reachable from this file or any other client-bundled code; the private
// key lives only in the server's own env var, read directly by
// api/test-push.js.
export async function sendTestPush() {
  if (!isPushSupported()) {
    return {
      ok: false,
      error: "Push notifications aren't supported on this browser or device.",
    };
  }

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return {
        ok: false,
        error: "Your login session has expired. Please log in again.",
      };
    }

    const response = await fetch("/api/test-push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        error: data?.error || "Unable to send background push test.",
      };
    }

    return {
      ok: true,
      sent: data?.sent ?? 0,
      failed: data?.failed ?? 0,
      removed: data?.removed ?? 0,
      message: data?.message || null,
    };
  } catch {
    return {
      ok: false,
      error: "Unable to reach the server. Check your connection and try again.",
    };
  }
}

// Unsubscribes THIS device only — never touches any other device's row,
// and never touches another user's row. Safe to call even if the device
// was never subscribed (no-ops).
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    const userId = await getAuthenticatedUserId();
    if (!userId) return;
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", userId);
  } catch {
    // Best-effort — a failed unsubscribe here must never block the
    // existing device-local notification preference from turning off.
  }
}
