// Phase 10A: pure, deterministic Smart Academic Planning foundation.
//
// This module only computes structured insight data from plain activity
// objects the caller already has — it has no React dependency, never
// touches Supabase/localStorage/network, never sends a Web Push, never
// reads or writes reminder_deliveries, and knows nothing about
// selectedSemesterId/activeSemesterId, Free/Pro entitlement, or PayMongo.
// It is not wired into App.jsx or any UI in this stage.
//
// ARCHITECTURE DECISION (Phase 10A audit, Option A): this module accepts
// already-enriched activity data (the same computedStatus/urgencyKey
// shape App.jsx's own enrichedActivities already produces) rather than
// importing anything from src/lib/reminderEngine.js. It deliberately
// does NOT re-derive computedStatus/urgencyKey itself — those are
// treated as already-decided facts the caller supplies, so this module
// adds only genuinely new logic (deadline-window counting and
// same-day grouping) instead of becoming a third implementation of
// status/urgency computation.
//
// SEMESTER SCOPING: this module intentionally has no concept of
// selectedSemesterId/activeSemesterId at all — it operates only on the
// activity array it is given. The caller (eventually App.jsx) is solely
// responsible for deciding which activities to pass in, so this module
// can never accidentally conflate the viewing context with the current
// academic-planning context.
//
// RECURRENCE: every recurring occurrence is already a materialized,
// independent activities row elsewhere in the app (see
// src/lib/recurrence.js) — this module performs no recurrence
// expansion or recurrence-aware special-casing of any kind; any
// recurrenceSeriesId/recurrenceRule field present on an input object is
// simply ignored.

// ---------------------------------------------------------------------
// Private calendar-date helpers
//
// Deadlines are "YYYY-MM-DD" strings. `new Date(deadline)` parses that
// as UTC midnight, which can silently roll back a day in timezones
// behind UTC — so every deadline here is parsed manually into numeric
// Y/M/D components and only ever compared via a UTC-anchor arithmetic
// trick (never reinterpreted as a real UTC instant), matching the same
// approach already used independently in src/App.jsx, src/lib/
// recurrence.js, and src/lib/reminderEngine.js. This module intentionally
// reimplements this small primitive rather than importing any of those,
// per the Phase 10A architecture decision to avoid new coupling while a
// shared neutral module remains deliberately deferred.
// ---------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Strict "YYYY-MM-DD" -> { year, month, day }, or null for anything
// malformed, out-of-range, or not a real calendar date (e.g.
// "2026-02-31" must never silently normalize into March, and
// "2026-02-29" must be rejected on a non-leap year). Never throws.
function parseCalendarDateStrict(dateStr) {
  if (typeof dateStr !== "string") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Built via Date.UTC purely as a validation probe — reading the
  // constructed date's own fields back and comparing against the input
  // catches every roll-over case (Feb 31, Feb 30, Feb 29 on a non-leap
  // year, month 13, etc.) that the Date constructor would otherwise
  // silently accept by rolling forward.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }

  return { year, month, day };
}

// Y/M/D calendar date -> epoch milliseconds at UTC midnight of that
// date. Used purely as an arithmetic anchor for day-difference
// computation below — never reinterpreted as "the moment in UTC." Both
// sides of every comparison in this module go through this same
// anchor, so the arithmetic is exact and independent of DST.
function calendarDateToUtcMs({ year, month, day }) {
  return Date.UTC(year, month - 1, day);
}

function formatCalendarDate({ year, month, day }) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// Whole-day difference (to - from) between two calendar dates, exact
// and DST-independent.
function daysBetween(fromParts, toParts) {
  return Math.round((calendarDateToUtcMs(toParts) - calendarDateToUtcMs(fromParts)) / 86400000);
}

// Reads the LOCAL calendar Y/M/D off a plain JS Date. This module
// deliberately stays on device/local wall-clock time (the Phase 10A
// Option A decision) — it never requires or resolves a stored IANA
// timezone, unlike src/lib/reminderEngine.js's server-capable engine.
function localCalendarDateFromInstant(instant) {
  return { year: instant.getFullYear(), month: instant.getMonth() + 1, day: instant.getDate() };
}

// Resolves one activity's deadline to validated calendar-date parts, or
// null when missing/malformed/impossible — the single choke point every
// date-based rule below goes through, guaranteeing "bad deadline data ->
// silently excluded," never a throw and never a guess.
function resolveDeadlineParts(activity) {
  if (!activity || typeof activity.deadline !== "string") return null;
  return parseCalendarDateStrict(activity.deadline);
}

function isCompleted(activity) {
  return activity?.computedStatus === "completed";
}

function isOverdue(activity) {
  return activity?.computedStatus === "overdue";
}

// ---------------------------------------------------------------------
// Smart Insights
// ---------------------------------------------------------------------

// Inclusive day-offset window for Rule 2 (near-term deadlines):
// 0 = today, 1 = tomorrow, 2 = day after, 3 = the third upcoming day.
const NEAR_TERM_WINDOW_DAYS = 3;

// Inclusive day-offset window for Rule 3 (busiest upcoming day):
// 0 = today through 6 = six days out — the next 7 calendar days
// including today.
const BUSIEST_DAY_WINDOW_DAYS = 6;

// A busiest-upcoming-day insight is only produced when at least this
// many activities share the same calendar deadline.
const BUSIEST_DAY_MIN_COUNT = 2;

// "Small capped list" — matches the same cap the existing Grades
// "Academic Insights" section (App.jsx) already uses for the identical
// deterministic-insights pattern this module follows.
const MAX_INSIGHTS = 3;

// Accepts { activities, now }:
//   - activities: an array of plain objects. Only the fields a given
//     rule actually needs are read (deadline, computedStatus); no field
//     is required to be present on every item. id/subjectId/semesterId/
//     urgencyKey/recurrenceSeriesId/recurrenceRule are accepted as part
//     of the caller's natural data shape but are not required or read
//     by any rule implemented here.
//   - now: an injectable Date, the sole "today" reference every rule
//     below uses. When a valid Date is supplied it is authoritative and
//     `new Date()` is never called; only when `now` is missing/invalid
//     does this fall back to the real current instant (a sensible
//     production default — tests must always pass an explicit `now`).
//
// Returns a small, capped array of structured insight objects — never
// UI-ready JSX/strings-only. Each insight always carries its underlying
// numeric/date data (count, date, windowDays, dayOffset as applicable)
// so a later UI layer can fully control presentation and phrasing;
// `message` is a plain, neutral, factual sentence provided for
// convenience only, never a subjective/severity label.
export function computeSmartInsights({ activities, now } = {}) {
  const list = Array.isArray(activities) ? activities : [];
  const referenceInstant = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const today = localCalendarDateFromInstant(referenceInstant);

  const insights = [];

  // -----------------------------------------------------------------
  // RULE 1 — overdue activities. Status-based only (never re-derived
  // from the deadline here) — computedStatus is the caller's already-
  // decided fact for this.
  // -----------------------------------------------------------------
  const overdueCount = list.filter((activity) => !isCompleted(activity) && isOverdue(activity)).length;
  if (overdueCount > 0) {
    insights.push({
      type: "overdue",
      count: overdueCount,
      message: `You have ${overdueCount} overdue ${overdueCount === 1 ? "activity" : "activities"}.`,
    });
  }

  // -----------------------------------------------------------------
  // RULE 2 — near-term deadlines: non-completed activities whose
  // deadline falls within [today, today + NEAR_TERM_WINDOW_DAYS],
  // inclusive on both ends. Deadline-based (not urgencyKey-based, which
  // is too coarse past 7 days) and independent of Rule 1 — an overdue
  // deadline (a negative offset) is naturally excluded by the offset
  // bounds check below, never by inspecting computedStatus here.
  // -----------------------------------------------------------------
  let nearTermCount = 0;
  for (const activity of list) {
    if (isCompleted(activity)) continue;
    const deadlineParts = resolveDeadlineParts(activity);
    if (!deadlineParts) continue;
    const offset = daysBetween(today, deadlineParts);
    if (offset >= 0 && offset <= NEAR_TERM_WINDOW_DAYS) nearTermCount += 1;
  }
  if (nearTermCount > 0) {
    insights.push({
      type: "near_term_deadlines",
      count: nearTermCount,
      windowDays: NEAR_TERM_WINDOW_DAYS,
      message: `You have ${nearTermCount} ${nearTermCount === 1 ? "deadline" : "deadlines"} within the next ${NEAR_TERM_WINDOW_DAYS} days.`,
    });
  }

  // -----------------------------------------------------------------
  // RULE 3 — busiest upcoming day: group non-completed activities with
  // a deadline in [today, today + BUSIEST_DAY_WINDOW_DAYS] by their
  // literal "YYYY-MM-DD" deadline, and find the date with the most
  // activities. Tie-break is deterministic and independent of input
  // order: the earliest date wins, decided by an explicit string
  // comparison on every candidate (never by Map/array iteration order).
  // -----------------------------------------------------------------
  const countsByDate = new Map();
  for (const activity of list) {
    if (isCompleted(activity)) continue;
    const deadlineParts = resolveDeadlineParts(activity);
    if (!deadlineParts) continue;
    const offset = daysBetween(today, deadlineParts);
    if (offset < 0 || offset > BUSIEST_DAY_WINDOW_DAYS) continue;
    const dateStr = formatCalendarDate(deadlineParts);
    countsByDate.set(dateStr, (countsByDate.get(dateStr) || 0) + 1);
  }

  let busiestDate = null;
  let busiestCount = 0;
  for (const [dateStr, count] of countsByDate) {
    const isNewMax = count > busiestCount;
    const isEarlierTie = count === busiestCount && busiestDate !== null && dateStr < busiestDate;
    if (isNewMax || isEarlierTie) {
      busiestDate = dateStr;
      busiestCount = count;
    }
  }

  if (busiestDate !== null && busiestCount >= BUSIEST_DAY_MIN_COUNT) {
    const busiestParts = parseCalendarDateStrict(busiestDate);
    insights.push({
      type: "busiest_upcoming_day",
      date: busiestDate,
      count: busiestCount,
      dayOffset: daysBetween(today, busiestParts),
      message: `${busiestDate} has a heavier workload with ${busiestCount} activities due.`,
    });
  }

  return insights.slice(0, MAX_INSIGHTS);
}
