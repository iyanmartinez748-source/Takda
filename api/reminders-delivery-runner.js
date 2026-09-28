import crypto from "crypto";

import webpush from "web-push";

import { computeReminderCandidates } from "../src/lib/reminderEngine.js";

/* =========================================================
   TAKDA PHASE 9E STAGE 9E-4C-2 — REMINDER DELIVERY RUNNER FOUNDATION

   Purpose:
   The server-side, multi-user foundation for automatic background
   reminders — the administrative counterpart to Stage 9E-4C-1's
   single-authenticated-user dry-run endpoint. This sweeps every user
   who has at least one push_subscriptions row, computes their reminder
   candidates via the Stage 9E-4B engine, and reports which candidates
   are already recorded in reminder_deliveries vs. which would be new.

   STAGE 9E-4C-2 SCOPE — READ/COMPUTE ONLY. NO SEND. NO CLAIM. NO WRITE.

   This file deliberately STOPS short of implementing the claim -> send
   -> finalize pipeline. See the "WHY THIS STOPS HERE" note below: the
   current reminder_deliveries schema (Stage 9E-4A) cannot yet safely
   model "claimed but not yet confirmed sent" as distinct from
   "delivered," which is required to avoid either (a) permanently
   losing a reminder if the process crashes between claiming and
   sending, or (b) sending a duplicate notification across overlapping/
   retried runs. Implementing claim/send/finalize against the current
   schema would necessarily violate one of those two guarantees, so it
   is not implemented here. This endpoint therefore:
     - never calls webpush.sendNotification (no web-push import exists
       in this file at all)
     - never inserts/updates reminder_deliveries (only ever reads it,
       to report what is already recorded)
     - never queries push_subscriptions for anything beyond user_id
       (never endpoint/p256dh/auth_key — no device/secret material is
       ever read, let alone returned)
     - never modifies any academic record or profile

   SECURITY RULE:
   This is an administrative/system endpoint, not a per-user browser
   endpoint like api/reminders-dry-run.js — there is no "logged in
   user" to derive identity from, because it must eventually be
   callable by a scheduler (a future Vercel Cron invocation, not added
   in this stage) rather than a signed-in browser tab. Authentication
   is therefore a shared server-only secret (CRON_SECRET), verified
   with a constant-time comparison — the same pattern already
   established by api/reconcile-orders.js's RECONCILE_SECRET check.
   CRON_SECRET is read from process.env only; this stage does not set,
   change, or require any new environment variable to exist yet — an
   unset CRON_SECRET makes this endpoint fail closed (500), never open.

   METHOD:
   GET only. Vercel's native Cron Jobs feature always invokes scheduled
   endpoints with GET (there is no way to configure a different method
   for it), so this endpoint is built GET-only now for genuine forward
   compatibility with a later cron stage, even though no cron exists
   yet in this stage.
========================================================= */

function safeSecretCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) {
    return false;
  }

  try {
    const aBuffer = Buffer.from(a, "utf8");
    const bBuffer = Buffer.from(b, "utf8");

    if (aBuffer.length !== bBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(aBuffer, bBuffer);
  } catch {
    return false;
  }
}

function toSemester(row) {
  return {
    id: row.id,
    name: row.name,
    schoolYear: row.school_year || "",
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    isActive: row.is_active || false,
    archivedAt: row.archived_at || null,
  };
}

function toSubject(row) {
  return {
    id: row.id,
    name: row.name,
    semesterId: row.semester_id ?? null,
  };
}

function toActivity(row) {
  return {
    id: row.id,
    subjectId: row.subject_id || "",
    title: row.title,
    deadline: row.deadline,
    status: row.status || "pending",
    semesterId: row.semester_id ?? null,
  };
}

function toSubjectSchedule(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location || "",
    reminderMinutes: row.reminder_minutes,
    notificationsEnabled: row.notifications_enabled,
  };
}

// Loads one user's reminder-relevant academic data and computes their
// candidates via the unmodified Stage 9E-4B engine — identical shape to
// api/reminders-dry-run.js's per-user loading, reused here for each
// eligible user in turn rather than for a single verified caller.
async function computeCandidatesForUser(userId, restHeaders, supabaseUrl) {
  const [profileRes, semestersRes, activitiesRes, subjectsRes, subjectSchedulesRes] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=timezone`, { headers: restHeaders }),
    fetch(`${supabaseUrl}/rest/v1/semesters?user_id=eq.${userId}&select=*`, { headers: restHeaders }),
    fetch(`${supabaseUrl}/rest/v1/activities?user_id=eq.${userId}&select=*`, { headers: restHeaders }),
    fetch(`${supabaseUrl}/rest/v1/subjects?user_id=eq.${userId}&select=*`, { headers: restHeaders }),
    fetch(`${supabaseUrl}/rest/v1/subject_schedules?user_id=eq.${userId}&select=*`, { headers: restHeaders }),
  ]);

  const [profileRows, semesterRows, activityRows, subjectRows, subjectScheduleRows] = await Promise.all([
    profileRes.json(),
    semestersRes.json(),
    activitiesRes.json(),
    subjectsRes.json(),
    subjectSchedulesRes.json(),
  ]);

  if (
    !profileRes.ok ||
    !semestersRes.ok ||
    !activitiesRes.ok ||
    !subjectsRes.ok ||
    !subjectSchedulesRes.ok ||
    !Array.isArray(profileRows) ||
    !Array.isArray(semesterRows) ||
    !Array.isArray(activityRows) ||
    !Array.isArray(subjectRows) ||
    !Array.isArray(subjectScheduleRows)
  ) {
    throw new Error(`Unable to load reminder data for user ${userId}`);
  }

  const rawTimezone = profileRows[0]?.timezone ?? null;

  const result = computeReminderCandidates({
    now: new Date(),
    timezone: rawTimezone,
    activities: activityRows.map(toActivity),
    subjects: subjectRows.map(toSubject),
    subjectSchedules: subjectScheduleRows.map(toSubjectSchedule),
    semesters: semesterRows.map(toSemester),
  });

  return result;
}

// READ-ONLY comparison against the persistent dedup ledger — never an
// insert/update/claim. Returns how many of this user's computed
// candidates already have a matching (user_id, dedup_key) row.
async function countAlreadyRecorded(userId, dedupKeys, restHeaders, supabaseUrl) {
  if (dedupKeys.length === 0) return 0;

  const encodedKeys = dedupKeys.map((key) => encodeURIComponent(key)).join(",");

  const response = await fetch(
    `${supabaseUrl}/rest/v1/reminder_deliveries?user_id=eq.${userId}&dedup_key=in.(${encodedKeys})&select=dedup_key`,
    { headers: restHeaders }
  );

  const rows = await response.json();

  if (!response.ok || !Array.isArray(rows)) {
    throw new Error(`Unable to read reminder_deliveries for user ${userId}`);
  }

  return rows.length;
}

/* =========================================================
   WEB PUSH FANOUT + STALE-SUBSCRIPTION CLEANUP — FOUNDATION ONLY

   NOT YET CALLED by the handler below. This step only adds and tests
   sendReminderToSubscriptions() in isolation; the endpoint's runtime
   behavior is unchanged — it remains fully dry-run/read-only
   (dryRun: true, liveSendEnabled: false, zero reminder_deliveries
   writes, zero real Web Push calls from the handler's own code path).
   Wiring this helper into the handler — and everything that requires
   (claim/reclaim, claim_token, the two finalize RPCs, MAX_ATTEMPTS,
   attempt_count handling, any activation gate, cron) — is deliberately
   out of scope for this step and is not implemented here.

   Conceptually mirrors api/test-push.js's already-proven send/cleanup
   pattern (Promise.allSettled fan-out; delete a subscription only on a
   404/410 response; leave any other failure alone) — reimplemented
   independently here rather than importing or modifying that file,
   since this helper serves a different caller (an administrative
   multi-user sweep, not a single authenticated user's test request)
   and api/test-push.js's own verified behavior must stay untouched.

   VAPID key configuration (webpush.setVapidDetails(...)) is
   deliberately NOT done here — that reads VITE_VAPID_PUBLIC_KEY/
   VAPID_PRIVATE_KEY and belongs to whichever future step actually
   wires this helper into the handler, exactly mirroring how
   api/test-push.js's own handler (not a separate helper) owns that
   call today.
========================================================= */

// Reduces an upstream web-push failure to one of a small, fixed set of
// safe category strings — never the subscription endpoint/p256dh/
// auth_key, never a raw header/token value, and never the upstream
// library's own error object/message (which could itself embed
// request details). This is the only form of "why did this fail"
// information that should ever reach reminder_deliveries.last_error
// once a later step wires failure-finalize in.
function categorizeSendError(error) {
  const statusCode = error?.statusCode;
  return statusCode === 404 || statusCode === 410 ? "stale_subscription" : "push_send_failed";
}

// Best-effort cleanup, deliberately isolated from the send outcome:
// deletes only the given 404/410 ("gone") subscription ids, scoped by
// BOTH id and user_id (never weakened to id alone), using the same
// service-role server-side pattern already proven in api/test-push.js.
//
// NEVER throws — a network error or any non-2xx response here is
// caught/detected locally and reported back as staleRemovedCount: 0,
// cleanupStatus: "cleanup_failed", never propagated as an exception.
// Cleanup is secondary housekeeping; it must never be capable of
// preventing sendReminderToSubscriptions from reporting an otherwise-
// successful send. Only the HTTP outcome (ok/not ok) is inspected —
// the response body/error text is never read or returned.
async function cleanupStaleSubscriptions(staleIds, userId, restHeaders, supabaseUrl) {
  if (staleIds.length === 0) {
    return { staleRemovedCount: 0, cleanupStatus: "not_needed" };
  }

  const idFilter = staleIds.map((id) => encodeURIComponent(id)).join(",");

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=in.(${idFilter})&user_id=eq.${userId}`, {
      method: "DELETE",
      headers: restHeaders,
    });

    if (!response.ok) {
      return { staleRemovedCount: 0, cleanupStatus: "cleanup_failed" };
    }

    return { staleRemovedCount: staleIds.length, cleanupStatus: "removed" };
  } catch {
    return { staleRemovedCount: 0, cleanupStatus: "cleanup_failed" };
  }
}

// Sends one already-constructed reminder payload to a user's already-
// loaded subscription records, fanning out independently per device
// (Promise.allSettled) so one device's failure never blocks delivery
// to another, then best-effort cleans up any 404/410 ("gone")
// subscriptions via cleanupStaleSubscriptions above.
//
// Event-level (not device-level) outcome, matching the approved
// reminder_deliveries dedup model: the event is considered sent the
// moment ANY device succeeds, regardless of how many others failed —
// and this is computed entirely independently of cleanup's own
// outcome, so a cleanup failure can never downgrade an otherwise-
// successful send, and errorCategory always describes DELIVERY
// (never cleanup) status. Zero subscriptions and "every device
// failed" are both event-level failures, intentionally represented
// as ordinary, retryable failures here (via errorCategory) rather
// than as a special terminal case — that decision belongs to a later
// failure-finalize step, not to this helper.
//
// staleDetectedCount (how many 404/410 responses were seen) and
// staleRemovedCount (how many were actually confirmed deleted) are
// reported separately, since a detected-stale subscription is not
// necessarily a removed one if cleanup itself fails.
//
// Returns ONLY safe aggregate information: booleans/counts/short
// category strings. Never returns the subscriptions/staleIds arrays,
// any endpoint/p256dh/auth_key value, any header, or any raw upstream
// error object/response body.
export async function sendReminderToSubscriptions({ subscriptions, payload, userId, restHeaders, supabaseUrl }) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return {
      eventSendSucceeded: false,
      sentCount: 0,
      failedCount: 0,
      staleDetectedCount: 0,
      staleRemovedCount: 0,
      cleanupStatus: "not_needed",
      errorCategory: "no_subscriptions",
    };
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush
        .sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth_key,
            },
          },
          payload
        )
        .then(() => ({ id: sub.id, ok: true }))
        .catch((error) => ({ id: sub.id, ok: false, category: categorizeSendError(error) }))
    )
  );

  const outcomes = results.map((r) => (r.status === "fulfilled" ? r.value : { ok: false, category: "push_send_failed" }));

  const staleIds = outcomes
    .filter((o) => !o.ok && o.category === "stale_subscription")
    .map((o) => o.id)
    .filter(Boolean);

  // Cleanup is called for its side effect only; its own outcome never
  // feeds into sentCount/failedCount/eventSendSucceeded/errorCategory
  // below — those are computed purely from the send outcomes.
  const { staleRemovedCount, cleanupStatus } = await cleanupStaleSubscriptions(staleIds, userId, restHeaders, supabaseUrl);

  const sentCount = outcomes.filter((o) => o.ok).length;
  const failedCount = outcomes.length - sentCount;
  const eventSendSucceeded = sentCount > 0;

  let errorCategory = null;
  if (!eventSendSucceeded) {
    const failureOutcomes = outcomes.filter((o) => !o.ok);
    errorCategory = failureOutcomes.every((o) => o.category === "stale_subscription")
      ? "all_subscriptions_stale"
      : "push_send_failed";
  }

  return {
    eventSendSucceeded,
    sentCount,
    failedCount,
    staleDetectedCount: staleIds.length,
    staleRemovedCount,
    cleanupStatus,
    errorCategory,
  };
}

/* =========================================================
   ATOMIC REMINDER DELIVERY CLAIM + RECLAIM — FOUNDATION ONLY

   NOT YET CALLED by the handler below. This step only adds and tests
   claimReminderEvent()/reclaimExpiredReminderEvent() in isolation; the
   endpoint's runtime behavior is unchanged — it remains fully dry-run/
   read-only (dryRun: true, liveSendEnabled: false, zero
   reminder_deliveries writes from the handler's own code path). No
   finalize RPC call, no attempt_count handling, no retry cap, and no
   activation gate are introduced here — see the Stage 9E-4C-2
   claim/reclaim design review for why those are deliberately deferred.

   Per that review, ownership is established by the atomic write
   itself — never by a SELECT-then-decide-then-write sequence — and
   claim_token is the fencing token every later finalize call must
   present exactly, so a worker whose claim has since been superseded
   by a reclaim can never successfully finalize (see
   supabase/migrations/20260926000000_reminder_delivery_claim_token.sql
   for the two finalize RPCs these helpers exist to eventually feed,
   not yet called from here).
========================================================= */

// The lease every successful claim/reclaim grants — long enough to
// comfortably cover a normal send attempt, short enough that a
// genuine crash is retried within a few minutes rather than leaving a
// time-sensitive reminder stuck. Matches the already-approved 3-minute
// design; kept as one named constant so both helpers below (and any
// later retry-sweep code) share a single source of truth.
const CLAIM_LEASE_MS = 3 * 60 * 1000;

// Atomically attempts to claim a brand-new reminder event. No SELECT
// is ever performed first — a single INSERT, gated by the existing
// unique(user_id, dedup_key) constraint via
// `on_conflict=user_id,dedup_key` + `Prefer: resolution=ignore-
// duplicates`, is itself the ownership decision. reminder_deliveries
// has TWO unique constraints (the primary key `id` and
// unique(user_id, dedup_key)) — the on_conflict query parameter is
// required so PostgREST targets the latter, never the former (which
// would never conflict, since a fresh random `id` is generated on
// every insert, silently defeating dedup entirely).
//
// Ownership is read from the RETURNED ARRAY, never from the HTTP
// status alone: a losing/conflicting insert still returns 2xx (with
// resolution=ignore-duplicates translating the conflict into a
// server-side no-op), just with an empty array.
//
// Returns ONLY { claimed, claimToken, leaseExpiresAt } — an
// INTERNAL-ONLY result never meant to be spread into an HTTP
// response; userId/dedupKey are never echoed back (the caller already
// has both), and no thrown error message ever includes userId,
// dedupKey, the response body, or any credential.
export async function claimReminderEvent({ userId, category, sourceId, dedupKey, restHeaders, supabaseUrl }) {
  const claimToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();

  // The fetch call, its response.ok check, and response.json() are all
  // inside ONE try/catch so every failure mode — a network-level
  // rejection, a non-2xx HTTP status, or a malformed-JSON parse error —
  // escapes through the exact same fixed, generic message. Never the
  // raw upstream error, never the response body, never userId/dedupKey/
  // claimToken/the Supabase URL/the service-role key. Deliberately no
  // console.error here — this is a pure computation helper, not (yet)
  // wired into the handler's own request-scoped logging.
  let rows;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/reminder_deliveries?on_conflict=user_id,dedup_key`, {
      method: "POST",
      headers: {
        ...restHeaders,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        user_id: userId,
        category,
        source_id: sourceId,
        dedup_key: dedupKey,
        status: "claimed",
        attempt_count: 0,
        claim_token: claimToken,
        lease_expires_at: leaseExpiresAt,
        // delivered_at is deliberately omitted — its own DEFAULT now()
        // already captures "row first created at," its documented
        // legacy meaning. sent_at/last_attempt_at/last_error are never
        // set here; they belong to a later finalize step.
      }),
    });

    if (!response.ok) {
      throw new Error("non-ok response");
    }

    rows = await response.json();
  } catch {
    throw new Error("Unable to claim reminder event.");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { claimed: false, claimToken: null, leaseExpiresAt: null };
  }

  return { claimed: true, claimToken, leaseExpiresAt };
}

// Atomically attempts to reclaim an existing 'claimed' event whose
// lease has expired. No SELECT is ever performed first — a single
// conditional UPDATE, gated by all four filters together
// (user_id + dedup_key + status='claimed' + lease_expires_at < now),
// is itself the ownership decision, exactly mirroring
// claimReminderEvent's INSERT-decides-ownership approach. Two
// concurrent reclaim attempts for the same row can never both
// succeed: PostgreSQL's row lock + READ COMMITTED re-check (see the
// Stage 9E-4C-2 concurrency review) means the loser's WHERE clause
// re-evaluates against the winner's already-committed (now
// future-dated) lease and matches zero rows.
//
// A fresh claim_token is minted on every successful reclaim — the
// fencing mechanism that makes a superseded worker's later finalize
// attempt (still holding its old token) safely affect zero rows.
// attempt_count is deliberately never touched here — it increments
// only during a later, not-yet-implemented finalize step.
//
// Same internal-only { claimed, claimToken, leaseExpiresAt } return
// shape as claimReminderEvent, with the same privacy discipline.
export async function reclaimExpiredReminderEvent({ userId, dedupKey, restHeaders, supabaseUrl }) {
  const claimToken = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();

  // Same single-try/catch discipline as claimReminderEvent: every
  // failure mode (network rejection, non-2xx, malformed JSON) escapes
  // through the same fixed, generic message only — never raw upstream
  // details, never logged.
  let rows;
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/reminder_deliveries` +
        `?user_id=eq.${encodeURIComponent(userId)}` +
        `&dedup_key=eq.${encodeURIComponent(dedupKey)}` +
        `&status=eq.${encodeURIComponent("claimed")}` +
        `&lease_expires_at=lt.${encodeURIComponent(nowIso)}`,
      {
        method: "PATCH",
        headers: {
          ...restHeaders,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          claim_token: claimToken,
          lease_expires_at: leaseExpiresAt,
          // Deliberately the ONLY two fields in this body — status,
          // delivered_at, sent_at, last_attempt_at, last_error,
          // category, source_id, and attempt_count are all untouched
          // by a reclaim.
        }),
      }
    );

    if (!response.ok) {
      throw new Error("non-ok response");
    }

    rows = await response.json();
  } catch {
    throw new Error("Unable to reclaim reminder event.");
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { claimed: false, claimToken: null, leaseExpiresAt: null };
  }

  return { claimed: true, claimToken, leaseExpiresAt };
}

/* =========================================================
   FINALIZE RPC HELPER LAYER — FOUNDATION ONLY

   NOT YET CALLED by the handler below. This step only adds and tests
   finalizeReminderDeliverySuccess()/finalizeReminderDeliveryFailure()
   in isolation; the endpoint's runtime behavior is unchanged — it
   remains fully dry-run/read-only (dryRun: true, liveSendEnabled:
   false, zero reminder_deliveries writes from the handler's own code
   path, zero real Web Push).

   Both helpers are thin, dormant callers of the two database RPCs
   introduced by
   supabase/migrations/20260926000000_reminder_delivery_claim_token.sql
   (and privilege-hardened by
   20260927000000_reminder_delivery_finalize_rpc_privilege_hardening.sql
   — anon/authenticated EXECUTE revoked, service_role granted). All
   state-transition logic — attempt_count += 1, last_attempt_at,
   status -> 'sent'/'abandoned', sent_at, last_error truncation, lease
   release, and claim_token ownership fencing — is owned entirely by
   the RPC body server-side. Nothing here recomputes or duplicates any
   of that; these helpers only ever build the request and interpret
   whether the returned array is empty.

   Unlike claim (POST to the table) and reclaim (PATCH to the table),
   neither RPC call needs a Prefer header: Prefer: return=representation
   governs whether a table-level INSERT/UPDATE/DELETE echoes affected
   rows, but an RPC call already returns whatever the function's
   RETURNS SETOF ... produces as the response body regardless.
========================================================= */

// The retry cap failure-finalize enforces — an application-level
// policy constant, not a database CHECK (deliberately, so it can be
// tuned later without a migration, per the approved schema design).
// Callers can never override this; it is always sent as this fixed
// literal, never a caller-supplied value.
const MAX_DELIVERY_ATTEMPTS = 5;

// The only error-category strings finalizeReminderDeliveryFailure may
// ever forward to the database as last_error. These are exactly and
// only the values sendReminderToSubscriptions can produce today (its
// errorCategory is null on success, or one of these three otherwise)
// — never a raw Error.message, never anything caller-supplied without
// being validated against this exact set first.
const SAFE_FINALIZE_ERROR_CATEGORIES = new Set(["no_subscriptions", "all_subscriptions_stale", "push_send_failed"]);

// Atomically finalizes a currently-claimed event as successfully sent,
// via finalize_reminder_delivery_success. Ownership is read from the
// RETURNED ARRAY: non-empty means this call's claim_token still
// matched at the moment the RPC ran; a superseded/stale token affects
// zero rows (the fencing design working exactly as intended), which
// is reported back as { finalized: false }, never as an error.
//
// Returns ONLY { finalized: boolean } — the returned reminder_deliveries
// row is never surfaced, and no thrown error message ever includes
// userId, dedupKey, claimToken, the response body, the Supabase URL,
// or any credential.
export async function finalizeReminderDeliverySuccess({ userId, dedupKey, claimToken, restHeaders, supabaseUrl }) {
  let rows;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/finalize_reminder_delivery_success`, {
      method: "POST",
      headers: {
        ...restHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_dedup_key: dedupKey,
        p_claim_token: claimToken,
      }),
    });

    if (!response.ok) {
      throw new Error("non-ok response");
    }

    rows = await response.json();

    if (!Array.isArray(rows)) {
      throw new Error("non-array response");
    }
  } catch {
    throw new Error("Unable to finalize reminder delivery success.");
  }

  return { finalized: rows.length > 0 };
}

// Atomically finalizes a currently-claimed event as a failed attempt,
// via finalize_reminder_delivery_failure — the one operation that
// structurally requires a database function rather than a plain
// PostgREST PATCH, since attempt_count = attempt_count + 1 combined
// with a conditional status transition cannot be expressed as literal
// PATCH body values.
//
// errorCategory is validated against SAFE_FINALIZE_ERROR_CATEGORIES
// BEFORE any network call — an invalid value results in zero fetch
// calls and fails closed with the same fixed message an RPC-level
// failure would use, never interpolating, logging, or forwarding the
// rejected value anywhere.
//
// Same ownership/return-shape discipline as
// finalizeReminderDeliverySuccess: { finalized: boolean } only.
export async function finalizeReminderDeliveryFailure({ userId, dedupKey, claimToken, errorCategory, restHeaders, supabaseUrl }) {
  if (!SAFE_FINALIZE_ERROR_CATEGORIES.has(errorCategory)) {
    throw new Error("Unable to finalize reminder delivery failure.");
  }

  let rows;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/finalize_reminder_delivery_failure`, {
      method: "POST",
      headers: {
        ...restHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_dedup_key: dedupKey,
        p_claim_token: claimToken,
        p_error: errorCategory,
        p_max_attempts: MAX_DELIVERY_ATTEMPTS,
      }),
    });

    if (!response.ok) {
      throw new Error("non-ok response");
    }

    rows = await response.json();

    if (!Array.isArray(rows)) {
      throw new Error("non-array response");
    }
  } catch {
    throw new Error("Unable to finalize reminder delivery failure.");
  }

  return { finalized: rows.length > 0 };
}

/* =========================================================
   ONE-CANDIDATE REMINDER DELIVERY ORCHESTRATOR — DORMANT FOUNDATION ONLY

   NOT YET CALLED by the handler below. This step only adds and tests
   processReminderCandidate() in isolation; the endpoint's runtime
   behavior is unchanged — it remains fully dry-run/read-only
   (dryRun: true, liveSendEnabled: false, zero reminder_deliveries
   writes, zero real Web Push calls from the handler's own code path).

   This function composes — never reimplements — claimReminderEvent,
   reclaimExpiredReminderEvent, sendReminderToSubscriptions,
   finalizeReminderDeliverySuccess, and finalizeReminderDeliveryFailure
   (all defined above). All five are accepted as injectable parameters
   (claimFn/reclaimFn/sendFn/finalizeSuccessFn/finalizeFailureFn,
   defaulting to the real exported functions) so tests can exercise
   this orchestrator's own control flow — claim/reclaim decisions,
   the pre-send lease check, fanout->finalize mapping, ownership-loss
   handling, internal-error handling — without re-mocking every layer
   of fetch/response each of those helpers already has its own,
   separate test coverage for. This is dependency injection via plain
   parameters, not ESM binding monkey-patching: no export of this file
   is ever reassigned.

   CLAIM -> RECLAIM:
   A brand-new event is claimed via claimReminderEvent. If that finds
   an existing row (claimed: false — which covers a live lease, an
   already-'sent' row, and an already-'abandoned' row identically; see
   the Stage 9E-4C-2 orchestration design review for why the initial
   claim response alone cannot and need not distinguish those three),
   reclaimExpiredReminderEvent is attempted next; only its own WHERE
   clause (status = 'claimed' AND lease expired) can distinguish "due
   for retry" from every other case, so a reclaim failure is always
   reported as ownership_not_acquired without further action. Neither
   helper is ever retried, and a thrown error from either immediately
   returns internal_error without attempting the next step — a claim
   or reclaim network failure never modifies any row, so there is
   nothing to compensate for.

   PRE-SEND LEASE SAFETY (see the Stage 9E-4C-2 orchestration design
   review, "stale-worker send risk"): claim_token fences only the
   DATABASE write a finalize call makes — it has no effect on whether
   webpush.sendNotification() itself is allowed to run. A worker whose
   lease is about to (or already did) expire could still send
   externally while a second worker has already reclaimed the same
   row, risking a genuine duplicate notification on the user's device.
   This check narrows, but cannot eliminate, that window — a
   check-then-send gap always remains — so it is a duplicate-
   minimizing safeguard, never a duplicate-eliminating guarantee.
   `now` is an injectable function (defaulting to Date.now) purely so
   tests can exercise every lease-boundary case deterministically,
   without depending on real wall-clock timing.

   ATTEMPT_COUNT DISCIPLINE: this function never touches attempt_count
   itself — only the two finalize RPCs (called via finalizeSuccessFn/
   finalizeFailureFn) do that, server-side. A failure-finalize call is
   made ONLY when a real sendReminderToSubscriptions result exists
   (including the zero-subscriptions case, which that helper itself
   already reports as errorCategory: "no_subscriptions" — a genuine
   event-level delivery failure, not a special case here). Every other
   failure mode below (ownership not acquired, lease not safe, a
   claim/reclaim/subscription-query/fanout/finalize-transport error)
   returns without ever calling either finalize helper, so it can
   never consume one of the five total attempts on pure infrastructure
   noise.

   SUBSCRIPTION LOADING is plain inline fetch (not delegated to a
   named helper, since no separately-tested helper for it exists yet)
   selecting only id/endpoint/p256dh/auth_key — the exact four fields
   sendReminderToSubscriptions reads — via the same single-try/catch
   discipline used throughout this file: a network rejection, non-2xx
   response, or non-array JSON body all collapse to internal_error,
   never a raw upstream error, never subscription data logged.

   RESULT SHAPE is deliberately minimal: { outcome, category, dedupKey }
   only — never claimToken, leaseExpiresAt, any subscription field, any
   header, or any raw error, matching every other helper's established
   privacy discipline in this file.
========================================================= */

const PRE_SEND_LEASE_SAFETY_MS = 30 * 1000;

// Same fixed { title, body } JSON-string contract api/test-push.js and
// src/sw.js's push handler already establish — no new payload field,
// no new notification UI, no url (sw.js's existing same-origin-root
// fallback is untouched). Built from fields reminderEngine.js's
// candidate objects already carry; never any subscription/claim/auth
// data.
function buildActivityReminderBody(candidate) {
  const title = typeof candidate.title === "string" && candidate.title ? candidate.title : "An activity";
  if (candidate.urgencyKey === "today") return `"${title}" is due today.`;
  if (candidate.urgencyKey === "tomorrow") return `"${title}" is due tomorrow.`;
  return `"${title}" is overdue.`;
}

function buildClassReminderBody(candidate) {
  const subjectPart = typeof candidate.subjectName === "string" && candidate.subjectName ? candidate.subjectName : "Class";
  const startTime = typeof candidate.startTime === "string" && candidate.startTime ? candidate.startTime : "";
  return startTime ? `${subjectPart} starts at ${startTime}.` : `${subjectPart} is starting soon.`;
}

function buildReminderPayload(candidate) {
  const body = candidate?.kind === "class" ? buildClassReminderBody(candidate) : buildActivityReminderBody(candidate);
  return JSON.stringify({ title: "Takda", body });
}

// Every return path in processReminderCandidate goes through this —
// the single choke point guaranteeing the result shape never
// accidentally grows a sensitive field.
function buildOrchestratorResult(outcome, candidate) {
  return { outcome, category: candidate.category, dedupKey: candidate.dedupKey };
}

export async function processReminderCandidate({
  candidate,
  userId,
  restHeaders,
  supabaseUrl,
  now = Date.now,
  claimFn = claimReminderEvent,
  reclaimFn = reclaimExpiredReminderEvent,
  sendFn = sendReminderToSubscriptions,
  finalizeSuccessFn = finalizeReminderDeliverySuccess,
  finalizeFailureFn = finalizeReminderDeliveryFailure,
}) {
  let ownership;

  try {
    ownership = await claimFn({
      userId,
      category: candidate.category,
      sourceId: candidate.sourceId,
      dedupKey: candidate.dedupKey,
      restHeaders,
      supabaseUrl,
    });
  } catch {
    return buildOrchestratorResult("internal_error", candidate);
  }

  if (!ownership.claimed) {
    try {
      ownership = await reclaimFn({ userId, dedupKey: candidate.dedupKey, restHeaders, supabaseUrl });
    } catch {
      return buildOrchestratorResult("internal_error", candidate);
    }

    if (!ownership.claimed) {
      return buildOrchestratorResult("ownership_not_acquired", candidate);
    }
  }

  const claimToken = ownership.claimToken;
  const leaseExpiresAtMs = typeof ownership.leaseExpiresAt === "string" ? Date.parse(ownership.leaseExpiresAt) : NaN;

  if (!Number.isFinite(leaseExpiresAtMs) || leaseExpiresAtMs - now() <= PRE_SEND_LEASE_SAFETY_MS) {
    return buildOrchestratorResult("lease_not_safe", candidate);
  }

  let subscriptions;
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,endpoint,p256dh,auth_key`,
      { headers: restHeaders }
    );

    if (!response.ok) {
      throw new Error("non-ok response");
    }

    subscriptions = await response.json();

    if (!Array.isArray(subscriptions)) {
      throw new Error("non-array response");
    }
  } catch {
    return buildOrchestratorResult("internal_error", candidate);
  }

  let sendResult;
  try {
    sendResult = await sendFn({
      subscriptions,
      payload: buildReminderPayload(candidate),
      userId,
      restHeaders,
      supabaseUrl,
    });
  } catch {
    return buildOrchestratorResult("internal_error", candidate);
  }

  if (sendResult.eventSendSucceeded) {
    let finalizeResult;
    try {
      finalizeResult = await finalizeSuccessFn({ userId, dedupKey: candidate.dedupKey, claimToken, restHeaders, supabaseUrl });
    } catch {
      return buildOrchestratorResult("internal_error", candidate);
    }

    return buildOrchestratorResult(finalizeResult.finalized ? "sent" : "ownership_lost_after_send", candidate);
  }

  let finalizeResult;
  try {
    finalizeResult = await finalizeFailureFn({
      userId,
      dedupKey: candidate.dedupKey,
      claimToken,
      errorCategory: sendResult.errorCategory,
      restHeaders,
      supabaseUrl,
    });
  } catch {
    return buildOrchestratorResult("internal_error", candidate);
  }

  return buildOrchestratorResult(
    finalizeResult.finalized ? "failed_finalized" : "ownership_lost_after_failed_send",
    candidate
  );
}

/* =========================================================
   BULK ELIGIBLE-USER REMINDER RUNNER — DORMANT FOUNDATION ONLY

   NOT YET CALLED by the handler below. This step only adds and tests
   processAllEligibleUsers() in isolation; the endpoint's runtime
   behavior is unchanged — it remains fully dry-run/read-only
   (dryRun: true, liveSendEnabled: false, zero reminder_deliveries
   writes, zero real Web Push calls from the handler's own code path).

   This function composes — never reimplements — the existing
   computeCandidatesForUser and processReminderCandidate, accepted as
   injectable parameters (computeCandidatesForUserFn/processCandidateFn,
   defaulting to the real functions) for the same dependency-injection
   reason processReminderCandidate itself accepts its five collaborators:
   so tests can exercise this function's own control flow — enumeration
   union/dedup, per-source failure handling, per-user/per-candidate
   failure isolation, aggregate counting — without re-mocking every
   layer of fetch/response those already-separately-tested functions
   own internally.

   ELIGIBLE-USER ENUMERATION (per the Stage 9E-4C-2 enumeration design
   review): the union of (a) every user_id with at least one
   push_subscriptions row, and (b) every user_id with at least one
   reminder_deliveries row where status = 'claimed' AND
   attempt_count < 5. Lease state is deliberately NOT an enumeration
   filter -- a live-lease row is included same as an expired one, since
   claimReminderEvent/reclaimExpiredReminderEvent's own atomicity (not
   this enumeration) is what makes that safe: a live-lease row simply
   resolves to ownership_not_acquired downstream, at the cost of one
   wasted claim attempt, never a correctness risk. Source (b) exists
   specifically so a user whose subscriptions have since been removed
   (unsubscribed, or stale-cleaned) never permanently strands an
   in-flight retryable delivery -- without it, such a user would never
   be enumerated again and their claimed row could never be reclaimed.
   Enumeration NEVER grants ownership by itself; it only decides which
   users are worth calling computeCandidatesForUser for. Ownership is
   still decided exclusively, atomically, by claimReminderEvent/
   reclaimExpiredReminderEvent inside processCandidateFn.

   CURRENT-CANDIDATE-ONLY RETRY SEMANTICS (documented design decision,
   not an oversight): this function only ever calls processCandidateFn
   for candidates computeCandidatesForUserFn CURRENTLY produces. It
   never reconstructs or retries a notification from an existing
   reminder_deliveries row independently of a freshly recomputed
   candidate carrying the exact same dedup_key. Because both dedup-key
   shapes are date/occurrence-scoped (reminderEngine.js embeds
   localToday / occurrenceLocalDate), a claimed row whose scoping day
   or occurrence window has already passed will never be recomputed
   again and can permanently remain non-terminal -- e.g. yesterday's
   activity reminder, a class occurrence whose delivery window has
   closed, or a candidate that stopped being produced because its
   source activity was completed/deleted or its semester became
   inactive/archived. This is accepted and intentional for this stage
   (see the Stage 9E-4C-2 enumeration design review): it causes no
   incorrect or duplicate send (nothing can ever write to a stranded
   row again), and it causes no loss of CURRENT reminder capability (a
   new day/occurrence always gets its own fresh, independently-tracked
   dedup_key). No cleanup logic, payload reconstruction from source_id,
   or forced sent/abandoned transition is implemented here or should
   be inferred as missing -- reconstructing an expired dedup_key's
   notification would be semantically wrong (its original meaning, e.g.
   "due today," no longer holds), not merely a data-availability gap.

   countAlreadyRecorded (defined above, used only by the handler's
   existing dry-run report) is deliberately NEVER called here: it can
   only answer "does any row exist," not which of claimed-live/claimed-
   expired-retryable/sent/abandoned that row is in, so using it as a
   pre-filter would risk silently suppressing a legitimately retryable
   candidate. Every current candidate is always passed to
   processCandidateFn; claim/reclaim's own atomic state read remains
   the sole, authoritative skip-vs-proceed decision.

   Both enumeration queries are plain inline fetch calls (matching
   processReminderCandidate's own subscription-loading style) rather
   than named exported helpers, since neither has separate test
   coverage of its own yet. Each is evaluated and can fail
   INDEPENDENTLY (fail-open per source): if one source's query fails
   (network rejection, non-2xx, malformed JSON, or a successful
   non-array body), processing continues using only the other source's
   users; only if BOTH fail does this function return immediately with
   usersConsidered: 0 and no processing, never throwing and never
   exposing a raw upstream error. Neither query selects any field
   beyond user_id -- no subscription material (endpoint/p256dh/
   auth_key/user_agent/created_at/last_seen_at) and no reminder_deliveries
   field beyond user_id (never dedup_key/source_id/claim_token/
   last_error/lease_expires_at) ever leaves either query.

   Pagination is deliberately NOT implemented here, matching every
   other PostgREST read already in this file (none of which handles
   Content-Range/pagination today) -- a known, already-accepted future
   scale limitation, not a new one introduced by this function.

   Processing is strictly SEQUENTIAL for both users and candidates (no
   Promise.all at either level) -- intentional for this foundation
   stage, matching the handler's own existing sequential per-user loop.

   AGGREGATE RESULT is deliberately minimal: counts only. Never a list
   of users or candidates, never userId/email/name/dedupKey/sourceId/
   claimToken/endpoint/p256dh/auth_key/Authorization/service-role key/
   raw Error/raw upstream body/raw subscription object -- matching
   every other helper's established privacy discipline in this file.
========================================================= */

// Each source's enumeration is isolated in its own try/catch, exactly
// mirroring the single-try/catch-to-generic-outcome discipline used
// throughout this file: a network rejection, non-2xx response, or a
// non-array JSON body all collapse to { succeeded: false, userIds: [] }
// for that source alone, never a thrown error and never a raw upstream
// detail. Only user_id is ever read off a row.
async function enumerateSubscriptionUserIds(restHeaders, supabaseUrl) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?select=user_id`, {
      headers: restHeaders,
    });

    if (!response.ok) {
      throw new Error("non-ok response");
    }

    const rows = await response.json();

    if (!Array.isArray(rows)) {
      throw new Error("non-array response");
    }

    return { succeeded: true, userIds: rows.map((row) => row.user_id).filter(Boolean) };
  } catch {
    return { succeeded: false, userIds: [] };
  }
}

async function enumerateRetryUserIds(restHeaders, supabaseUrl) {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/reminder_deliveries?status=eq.${encodeURIComponent("claimed")}&attempt_count=lt.5&select=user_id`,
      { headers: restHeaders }
    );

    if (!response.ok) {
      throw new Error("non-ok response");
    }

    const rows = await response.json();

    if (!Array.isArray(rows)) {
      throw new Error("non-array response");
    }

    return { succeeded: true, userIds: rows.map((row) => row.user_id).filter(Boolean) };
  } catch {
    return { succeeded: false, userIds: [] };
  }
}

export async function processAllEligibleUsers({
  restHeaders,
  supabaseUrl,
  computeCandidatesForUserFn = computeCandidatesForUser,
  processCandidateFn = processReminderCandidate,
}) {
  const subscriptionResult = await enumerateSubscriptionUserIds(restHeaders, supabaseUrl);
  const retryResult = await enumerateRetryUserIds(restHeaders, supabaseUrl);

  const subscriptionEnumerationSucceeded = subscriptionResult.succeeded;
  const retryEnumerationSucceeded = retryResult.succeeded;

  const outcomes = {
    sent: 0,
    failed_finalized: 0,
    ownership_not_acquired: 0,
    ownership_lost_after_send: 0,
    ownership_lost_after_failed_send: 0,
    lease_not_safe: 0,
    internal_error: 0,
  };

  if (!subscriptionEnumerationSucceeded && !retryEnumerationSucceeded) {
    return {
      subscriptionEnumerationSucceeded,
      retryEnumerationSucceeded,
      usersConsidered: 0,
      userProcessingErrors: 0,
      candidatesComputed: 0,
      outcomes,
    };
  }

  const userIds = Array.from(new Set([...subscriptionResult.userIds, ...retryResult.userIds].filter(Boolean)));

  let userProcessingErrors = 0;
  let candidatesComputed = 0;

  for (const userId of userIds) {
    let result;
    try {
      result = await computeCandidatesForUserFn(userId, restHeaders, supabaseUrl);
    } catch {
      userProcessingErrors += 1;
      continue;
    }

    if (!result || !Array.isArray(result.candidates)) {
      userProcessingErrors += 1;
      continue;
    }

    const candidates = result.candidates;
    candidatesComputed += candidates.length;

    for (const candidate of candidates) {
      let outcome;
      try {
        const candidateResult = await processCandidateFn({ candidate, userId, restHeaders, supabaseUrl });
        outcome = candidateResult?.outcome;
      } catch {
        outcome = "internal_error";
      }

      if (Object.prototype.hasOwnProperty.call(outcomes, outcome)) {
        outcomes[outcome] += 1;
      } else {
        outcomes.internal_error += 1;
      }
    }
  }

  return {
    subscriptionEnumerationSucceeded,
    retryEnumerationSucceeded,
    usersConsidered: userIds.length,
    userProcessingErrors,
    candidatesComputed,
    outcomes,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const CRON_SECRET = process.env.CRON_SECRET;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_SECRET) {
    console.error("Missing server delivery-runner configuration environment variables.");

    return res.status(500).json({
      error: "Server delivery-runner configuration is incomplete.",
    });
  }

  /* =========================================
     1. VERIFY THE SHARED SERVER SECRET

     No per-request user identity exists for this endpoint — it is
     administrative/system-invoked, never called with a browser
     session token. An ordinary authenticated user has no way to reach
     this endpoint at all, since it accepts only this shared secret and
     nothing derived from a Supabase session.
  ========================================= */

  const authHeader = req.headers.authorization || "";
  const suppliedSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!safeSecretCompare(suppliedSecret, CRON_SECRET)) {
    return res.status(401).json({
      error: "Unauthorized.",
    });
  }

  try {
    const restHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    };

    /* =========================================
       2. FIND ELIGIBLE USERS

       Only user_id is ever selected from push_subscriptions here —
       never endpoint/p256dh/auth_key. This stage never sends anything,
       so no device/key material is needed at all; the column exists
       only to determine which users currently have at least one
       registered device worth eventually notifying.
    ========================================= */

    const subsResponse = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=user_id`, {
      headers: restHeaders,
    });

    const subsRows = await subsResponse.json();

    if (!subsResponse.ok || !Array.isArray(subsRows)) {
      console.error("Unable to load eligible users for the reminder delivery runner.");

      return res.status(500).json({
        error: "Unable to load eligible users.",
      });
    }

    const userIds = Array.from(new Set(subsRows.map((row) => row.user_id).filter(Boolean)));

    /* =========================================
       3. PER-USER COMPUTE + READ-ONLY DEDUP COMPARISON

       Processed sequentially (not Promise.all across all users) to
       keep load on Supabase predictable for this foundation stage — a
       later scaling pass can introduce batching/concurrency limits if
       the user count grows large enough to need it.
    ========================================= */

    const perUser = [];
    let usersSkippedInvalidTimezone = 0;
    let totalNewCandidates = 0;
    let totalAlreadyRecorded = 0;

    for (const userId of userIds) {
      try {
        const result = await computeCandidatesForUser(userId, restHeaders, SUPABASE_URL);

        if (!result.timezoneValid) {
          usersSkippedInvalidTimezone += 1;
        }

        const dedupKeys = result.candidates.map((c) => c.dedupKey);
        const alreadyRecordedCount = await countAlreadyRecorded(userId, dedupKeys, restHeaders, SUPABASE_URL);
        const newCandidateCount = dedupKeys.length - alreadyRecordedCount;

        totalNewCandidates += newCandidateCount;
        totalAlreadyRecorded += alreadyRecordedCount;

        perUser.push({
          userId,
          timezoneValid: result.timezoneValid,
          activityCandidateCount: result.activityCandidates.length,
          classCandidateCount: result.classCandidates.length,
          totalCandidateCount: result.candidates.length,
          newCandidateCount,
          alreadyRecordedCount,
        });
      } catch (perUserError) {
        console.error("Reminder delivery runner per-user error:", perUserError.message);

        perUser.push({
          userId,
          error: "Unable to process this user.",
        });
      }
    }

    /* =========================================
       4. RETURN A SAFE, AGGREGATE DRY-RUN REPORT

       No candidate content (titles, subject names, deadlines) is
       included in this multi-user administrative report — only counts
       per user — to keep the blast radius of one response small
       relative to api/reminders-dry-run.js's single-account detail
       view. Never includes the service-role key, CRON_SECRET, or any
       push subscription field.
    ========================================= */

    return res.status(200).json({
      dryRun: true,
      liveSendEnabled: false,
      usersConsidered: userIds.length,
      usersSkippedInvalidTimezone,
      totals: {
        newCandidates: totalNewCandidates,
        alreadyRecorded: totalAlreadyRecorded,
      },
      perUser,
    });
  } catch (error) {
    console.error("Takda reminder delivery runner error:", error);

    return res.status(500).json({
      error: "Unable to compute the reminder delivery run.",
    });
  }
}
