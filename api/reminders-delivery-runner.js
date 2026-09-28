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
