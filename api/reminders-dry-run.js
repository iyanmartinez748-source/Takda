import { computeReminderCandidates } from "../src/lib/reminderEngine.js";

/* =========================================================
   TAKDA PHASE 9E STAGE 9E-4C-1 — PROTECTED DRY-RUN REMINDER RUNNER

   Purpose:
   Let a developer verify the Stage 9E-4B reminder engine
   (src/lib/reminderEngine.js) against a real, authenticated user's
   real Production-shaped academic data — WITHOUT sending anything and
   WITHOUT writing anything.

   SCOPE — READ/COMPUTE ONLY:
   This endpoint never calls webpush.sendNotification, never inserts/
   updates reminder_deliveries, never touches push_subscriptions (not
   even a read — candidate computation does not depend on it), and
   never modifies any academic record or profile. It is a reporting
   endpoint only.

   SECURITY RULE:
   The caller's identity is derived ONLY from verifying their Supabase
   access token against Supabase's own /auth/v1/user endpoint — the
   exact same pattern api/test-push.js already uses. A user_id is
   never accepted from the request body/query and never trusted from
   the client. Every table below is always queried filtered by THIS
   verified id, so a caller can only ever inspect their own data,
   independent of and in addition to RLS.
========================================================= */

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

// Sanitized, minimal candidate summary for a dry-run report — every
// field here already comes from reminderEngine.js's own candidate
// output (never a subscription/key/secret), reshaped only to drop
// nothing-sensitive-but-unnecessary duplication between activity and
// class candidate shapes.
function summarizeCandidate(candidate) {
  return {
    kind: candidate.kind,
    category: candidate.category,
    sourceId: candidate.sourceId,
    dedupKey: candidate.dedupKey,
    localDate: candidate.localDate,
    title: candidate.title ?? null,
    subjectName: candidate.subjectName ?? null,
    deadline: candidate.deadline ?? null,
    urgencyKey: candidate.urgencyKey ?? null,
    dayOfWeek: candidate.dayOfWeek ?? null,
    startTime: candidate.startTime ?? null,
    endTime: candidate.endTime ?? null,
    reminderMinutes: candidate.reminderMinutes ?? null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing server dry-run configuration environment variables.");

    return res.status(500).json({
      error: "Server dry-run configuration is incomplete.",
    });
  }

  try {
    /* =========================================
       1. GET ACCESS TOKEN
    ========================================= */

    const authHeader = req.headers.authorization || "";

    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    /* =========================================
       2. VERIFY USER WITH SUPABASE

       This is the ONLY source of the caller's identity for this
       request. Nothing from req.body/req.query is ever used to decide
       whose rows get loaded.
    ========================================= */

    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const user = await userResponse.json();

    if (!userResponse.ok || !user?.id) {
      return res.status(401).json({
        error: "Invalid or expired Takda session.",
      });
    }

    /* =========================================
       3. LOAD ONLY THIS USER'S OWN DATA

       Uses the service-role key (bypasses RLS, the same precedent
       already established by api/reconcile-orders.js and
       api/test-push.js) — but every query below is still explicitly
       filtered by the verified user.id from step 2, never a
       client-supplied value. push_subscriptions is deliberately never
       queried here: candidate computation does not depend on it.
    ========================================= */

    const restHeaders = {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    };

    const [profileRes, semestersRes, activitiesRes, subjectsRes, subjectSchedulesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=timezone`, { headers: restHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/semesters?user_id=eq.${user.id}&select=*`, { headers: restHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/activities?user_id=eq.${user.id}&select=*`, { headers: restHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/subjects?user_id=eq.${user.id}&select=*`, { headers: restHeaders }),
      fetch(`${SUPABASE_URL}/rest/v1/subject_schedules?user_id=eq.${user.id}&select=*`, { headers: restHeaders }),
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
      console.error("Unable to load dry-run data for reminder computation.");

      return res.status(500).json({
        error: "Unable to load data for the reminder dry run.",
      });
    }

    const rawTimezone = profileRows[0]?.timezone ?? null;
    const timezonePresent = typeof rawTimezone === "string" && rawTimezone.trim() !== "";

    const semesters = semesterRows.map(toSemester);
    const activities = activityRows.map(toActivity);
    const subjects = subjectRows.map(toSubject);
    const subjectSchedules = subjectScheduleRows.map(toSubjectSchedule);

    /* =========================================
       4. COMPUTE CANDIDATES VIA THE STAGE 9E-4B ENGINE

       No reminder eligibility logic is reimplemented here — this is
       the engine's own computation, unmodified. `now` is the current
       server instant; the engine itself resolves it into the user's
       local wall-clock time using their stored timezone, returning
       zero candidates whenever that timezone is missing or invalid
       rather than guessing.
    ========================================= */

    const result = computeReminderCandidates({
      now: new Date(),
      timezone: rawTimezone,
      activities,
      subjects,
      subjectSchedules,
      semesters,
    });

    /* =========================================
       5. RETURN A MINIMAL, SANITIZED DRY-RUN REPORT

       Never includes access tokens, the service-role key, VAPID key
       material, push subscription fields, or any other user's data.
    ========================================= */

    return res.status(200).json({
      dryRun: true,
      timezonePresent,
      timezoneValid: result.timezoneValid,
      localToday: result.localToday,
      counts: {
        semesters: semesters.length,
        activities: activities.length,
        subjects: subjects.length,
        subjectSchedules: subjectSchedules.length,
      },
      activityCandidateCount: result.activityCandidates.length,
      classCandidateCount: result.classCandidates.length,
      totalCandidateCount: result.candidates.length,
      candidates: result.candidates.map(summarizeCandidate),
    });
  } catch (error) {
    console.error("Takda reminder dry-run error:", error);

    return res.status(500).json({
      error: "Unable to compute the reminder dry run.",
    });
  }
}
