// Phase 10A: focused tests for the pure Smart Academic Planning engine
// (src/lib/planningEngine.js).
//
// Uses only Node's built-in test runner (node:test) and assert module —
// zero added dependencies, matching the same convention already used by
// src/lib/__tests__/reminderEngine.test.js and
// src/lib/__tests__/timezone.test.js. Run with:
//
//   node --test src/lib/__tests__/planningEngine.test.js
//
// Every test below passes an explicit `now` — never the machine's real
// current date — so these tests stay deterministic and correct
// regardless of when or where they run. planningEngine.js reads LOCAL
// calendar Y/M/D off `now` (the Phase 10A Option A decision to stay on
// device/local wall-clock time, never requiring an IANA timezone), so
// every `now` here is constructed via the local `new Date(year, month,
// day)` form, never `new Date("...Z")`/UTC-string form.

import test from "node:test";
import assert from "node:assert/strict";
import { computeSmartInsights } from "../planningEngine.js";

// A fixed local calendar date used as the default "today" for tests
// that don't care about a specific month/year-boundary case.
const NOW = new Date(2026, 3, 10); // 2026-04-10 (local)

function activity(overrides = {}) {
  return {
    id: "activity-1",
    deadline: "2026-04-10",
    computedStatus: "pending",
    urgencyKey: "today",
    subjectId: "subject-1",
    semesterId: "semester-1",
    ...overrides,
  };
}

// Adds `days` (may be negative) to a "YYYY-MM-DD" string via a pure
// UTC-anchor arithmetic trick — calendar-date math only, never
// reinterpreted as a real UTC instant, and independent of the running
// machine's own timezone. Deliberately reimplemented here rather than
// imported from planningEngine.js (which keeps its own date helper
// private) or any other module, per the Phase 10A "no new coupling"
// decision — test-only arithmetic, not production logic.
function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function findInsight(insights, type) {
  return insights.find((i) => i.type === type) || null;
}

// ---------------------------------------------------------------------
// 1. Zero activities
// ---------------------------------------------------------------------
test("computeSmartInsights: zero activities produces zero insights", () => {
  const insights = computeSmartInsights({ activities: [], now: NOW });
  assert.deepEqual(insights, []);
});

// ---------------------------------------------------------------------
// 2. One overdue activity
// ---------------------------------------------------------------------
test("computeSmartInsights: one overdue activity produces an overdue insight with count 1", () => {
  const insights = computeSmartInsights({
    activities: [activity({ id: "a1", computedStatus: "overdue", deadline: addDaysToDateStr("2026-04-10", -2) })],
    now: NOW,
  });
  const overdue = findInsight(insights, "overdue");
  assert.ok(overdue, "expected an overdue insight");
  assert.equal(overdue.count, 1);
  assert.equal(typeof overdue.message, "string");
});

// ---------------------------------------------------------------------
// 3. Multiple overdue activities
// ---------------------------------------------------------------------
test("computeSmartInsights: multiple overdue activities are all counted", () => {
  const insights = computeSmartInsights({
    activities: [
      activity({ id: "a1", computedStatus: "overdue", deadline: addDaysToDateStr("2026-04-10", -1) }),
      activity({ id: "a2", computedStatus: "overdue", deadline: addDaysToDateStr("2026-04-10", -3) }),
      activity({ id: "a3", computedStatus: "overdue", deadline: addDaysToDateStr("2026-04-10", -10) }),
    ],
    now: NOW,
  });
  assert.equal(findInsight(insights, "overdue").count, 3);
});

// ---------------------------------------------------------------------
// 4. Completed activity is excluded
// ---------------------------------------------------------------------
test("computeSmartInsights: a completed activity is excluded from overdue, near-term, and busiest-day", () => {
  const insights = computeSmartInsights({
    activities: [
      // Would otherwise count for every rule if completion were ignored.
      activity({ id: "a1", computedStatus: "completed", deadline: addDaysToDateStr("2026-04-10", -5) }),
      activity({ id: "a2", computedStatus: "completed", deadline: "2026-04-10" }),
    ],
    now: NOW,
  });
  assert.deepEqual(insights, []);
});

// ---------------------------------------------------------------------
// 5. Deadline today
// ---------------------------------------------------------------------
test("computeSmartInsights: a deadline of today (offset 0) counts toward near-term", () => {
  const insights = computeSmartInsights({
    activities: [activity({ id: "a1", computedStatus: "pending", deadline: "2026-04-10" })],
    now: NOW,
  });
  assert.equal(findInsight(insights, "near_term_deadlines").count, 1);
});

// ---------------------------------------------------------------------
// 6. Deadline tomorrow
// ---------------------------------------------------------------------
test("computeSmartInsights: a deadline of tomorrow (offset 1) counts toward near-term", () => {
  const insights = computeSmartInsights({
    activities: [activity({ id: "a1", computedStatus: "pending", deadline: addDaysToDateStr("2026-04-10", 1) })],
    now: NOW,
  });
  assert.equal(findInsight(insights, "near_term_deadlines").count, 1);
});

// ---------------------------------------------------------------------
// 7. Deadline exactly +3 calendar days (inclusive boundary)
// ---------------------------------------------------------------------
test("computeSmartInsights: a deadline exactly 3 days out is included (inclusive boundary)", () => {
  const insights = computeSmartInsights({
    activities: [activity({ id: "a1", computedStatus: "pending", deadline: addDaysToDateStr("2026-04-10", 3) })],
    now: NOW,
  });
  const nearTerm = findInsight(insights, "near_term_deadlines");
  assert.ok(nearTerm, "expected a near-term insight");
  assert.equal(nearTerm.count, 1);
  assert.equal(nearTerm.windowDays, 3);
});

// ---------------------------------------------------------------------
// 8. Deadline +4 days is excluded (exclusive boundary)
// ---------------------------------------------------------------------
test("computeSmartInsights: a deadline 4 days out is excluded from the near-term count", () => {
  const insights = computeSmartInsights({
    activities: [activity({ id: "a1", computedStatus: "pending", deadline: addDaysToDateStr("2026-04-10", 4) })],
    now: NOW,
  });
  assert.equal(findInsight(insights, "near_term_deadlines"), null);
});

// ---------------------------------------------------------------------
// 9. Overdue date is excluded from near-term count
// ---------------------------------------------------------------------
test("computeSmartInsights: an overdue deadline (negative offset) is excluded from near-term, even though it counts as overdue", () => {
  const insights = computeSmartInsights({
    activities: [
      activity({ id: "a1", computedStatus: "overdue", deadline: addDaysToDateStr("2026-04-10", -1) }),
      activity({ id: "a2", computedStatus: "pending", deadline: "2026-04-10" }),
    ],
    now: NOW,
  });
  assert.equal(findInsight(insights, "overdue").count, 1);
  // Only the offset-0 activity should count toward near-term — the
  // overdue one must never leak into this bucket.
  assert.equal(findInsight(insights, "near_term_deadlines").count, 1);
});

// ---------------------------------------------------------------------
// 10. Two activities on the same upcoming date create a busiest-day insight
// ---------------------------------------------------------------------
test("computeSmartInsights: two activities due on the same upcoming date produce a busiest-day insight", () => {
  const sameDate = addDaysToDateStr("2026-04-10", 2);
  const insights = computeSmartInsights({
    activities: [
      activity({ id: "a1", computedStatus: "pending", deadline: sameDate }),
      activity({ id: "a2", computedStatus: "pending", deadline: sameDate }),
    ],
    now: NOW,
  });
  const busiest = findInsight(insights, "busiest_upcoming_day");
  assert.ok(busiest, "expected a busiest-upcoming-day insight");
  assert.equal(busiest.date, sameDate);
  assert.equal(busiest.count, 2);
  assert.equal(busiest.dayOffset, 2);
});

test("computeSmartInsights: a single activity on a date never produces a busiest-day insight", () => {
  const insights = computeSmartInsights({
    activities: [activity({ id: "a1", computedStatus: "pending", deadline: addDaysToDateStr("2026-04-10", 2) })],
    now: NOW,
  });
  assert.equal(findInsight(insights, "busiest_upcoming_day"), null);
});

// ---------------------------------------------------------------------
// 11. Busiest-day tie chooses the earliest date
// ---------------------------------------------------------------------
test("computeSmartInsights: a tie between two equally-busy dates is broken by choosing the earliest date, regardless of input order", () => {
  const laterDate = addDaysToDateStr("2026-04-10", 5);
  const earlierDate = addDaysToDateStr("2026-04-10", 1);
  const insights = computeSmartInsights({
    activities: [
      // Later date's activities listed FIRST, to prove the tie-break
      // does not depend on insertion/iteration order.
      activity({ id: "a1", computedStatus: "pending", deadline: laterDate }),
      activity({ id: "a2", computedStatus: "pending", deadline: laterDate }),
      activity({ id: "a3", computedStatus: "pending", deadline: earlierDate }),
      activity({ id: "a4", computedStatus: "pending", deadline: earlierDate }),
    ],
    now: NOW,
  });
  const busiest = findInsight(insights, "busiest_upcoming_day");
  assert.equal(busiest.date, earlierDate);
  assert.equal(busiest.count, 2);
});

// ---------------------------------------------------------------------
// 12. Invalid deadline string is ignored safely
// ---------------------------------------------------------------------
test("computeSmartInsights: a malformed deadline string is ignored, never thrown", () => {
  assert.doesNotThrow(() => {
    const insights = computeSmartInsights({
      activities: [
        activity({ id: "a1", computedStatus: "pending", deadline: "not-a-date" }),
        activity({ id: "a2", computedStatus: "pending", deadline: "2026/04/10" }),
        activity({ id: "a3", computedStatus: "pending", deadline: "2026-13-01" }),
      ],
      now: NOW,
    });
    assert.deepEqual(insights, []);
  });
});

// ---------------------------------------------------------------------
// 13. Impossible calendar date such as 2026-02-31 is ignored
// ---------------------------------------------------------------------
test("computeSmartInsights: an impossible calendar date (2026-02-31) is ignored, never rolled into March", () => {
  const insights = computeSmartInsights({
    activities: [activity({ id: "a1", computedStatus: "pending", deadline: "2026-02-31" })],
    now: new Date(2026, 1, 25), // 2026-02-25
  });
  assert.deepEqual(insights, []);
});

// ---------------------------------------------------------------------
// 14. Missing deadline is ignored
// ---------------------------------------------------------------------
test("computeSmartInsights: a missing/null/undefined deadline is ignored safely", () => {
  assert.doesNotThrow(() => {
    const insights = computeSmartInsights({
      activities: [
        activity({ id: "a1", computedStatus: "pending", deadline: undefined }),
        activity({ id: "a2", computedStatus: "pending", deadline: null }),
        { id: "a3", computedStatus: "pending" }, // deadline key entirely absent
      ],
      now: NOW,
    });
    assert.deepEqual(insights, []);
  });
});

// ---------------------------------------------------------------------
// 15. Recurring-series metadata does not cause expansion or duplication
// ---------------------------------------------------------------------
test("computeSmartInsights: recurrence metadata on fixture data causes no expansion or duplication", () => {
  const sameDate = addDaysToDateStr("2026-04-10", 1);
  const insights = computeSmartInsights({
    activities: [
      activity({
        id: "occurrence-1",
        computedStatus: "pending",
        deadline: sameDate,
        recurrenceSeriesId: "series-1",
        recurrenceRule: "weekly",
      }),
      activity({
        id: "occurrence-2",
        computedStatus: "pending",
        deadline: addDaysToDateStr(sameDate, 7),
        recurrenceSeriesId: "series-1",
        recurrenceRule: "weekly",
      }),
    ],
    now: NOW,
  });
  // Each materialized occurrence is independent: exactly one near-term
  // deadline (the second occurrence, 8 days out, falls outside both
  // windows) and no busiest-day insight (each date has only one
  // activity) — never a doubled/expanded count from the shared
  // recurrenceSeriesId.
  assert.equal(findInsight(insights, "near_term_deadlines").count, 1);
  assert.equal(findInsight(insights, "busiest_upcoming_day"), null);
});

// ---------------------------------------------------------------------
// 16. Deterministic results when an explicit `now` is supplied
// ---------------------------------------------------------------------
test("computeSmartInsights: identical input and explicit now always produce identical output", () => {
  const activities = [
    activity({ id: "a1", computedStatus: "overdue", deadline: addDaysToDateStr("2026-04-10", -1) }),
    activity({ id: "a2", computedStatus: "pending", deadline: addDaysToDateStr("2026-04-10", 2) }),
    activity({ id: "a3", computedStatus: "pending", deadline: addDaysToDateStr("2026-04-10", 2) }),
  ];
  const first = computeSmartInsights({ activities, now: NOW });
  const second = computeSmartInsights({ activities, now: NOW });
  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------
// 17. Month boundary
// ---------------------------------------------------------------------
test("computeSmartInsights: near-term window correctly crosses a month boundary", () => {
  const monthBoundaryNow = new Date(2026, 3, 29); // 2026-04-29
  const insights = computeSmartInsights({
    activities: [
      // +3 days from April 29 is May 2.
      activity({ id: "a1", computedStatus: "pending", deadline: "2026-05-02" }),
    ],
    now: monthBoundaryNow,
  });
  assert.equal(findInsight(insights, "near_term_deadlines").count, 1);
});

// ---------------------------------------------------------------------
// 18. Year boundary
// ---------------------------------------------------------------------
test("computeSmartInsights: near-term window correctly crosses a year boundary", () => {
  const yearBoundaryNow = new Date(2026, 11, 30); // 2026-12-30
  const insights = computeSmartInsights({
    activities: [
      // +3 days from Dec 30, 2026 is Jan 2, 2027.
      activity({ id: "a1", computedStatus: "pending", deadline: "2027-01-02" }),
    ],
    now: yearBoundaryNow,
  });
  assert.equal(findInsight(insights, "near_term_deadlines").count, 1);
});

// ---------------------------------------------------------------------
// 19. Leap-year valid date
// ---------------------------------------------------------------------
test("computeSmartInsights: February 29 on a real leap year (2028) is accepted", () => {
  const insights = computeSmartInsights({
    activities: [activity({ id: "a1", computedStatus: "pending", deadline: "2028-02-29" })],
    now: new Date(2028, 1, 27), // 2028-02-27
  });
  assert.equal(findInsight(insights, "near_term_deadlines").count, 1);
});

// ---------------------------------------------------------------------
// 20. Non-leap invalid February 29
// ---------------------------------------------------------------------
test("computeSmartInsights: February 29 on a non-leap year (2026) is rejected", () => {
  const insights = computeSmartInsights({
    activities: [activity({ id: "a1", computedStatus: "pending", deadline: "2026-02-29" })],
    now: new Date(2026, 1, 27), // 2026-02-27
  });
  assert.deepEqual(insights, []);
});

// ---------------------------------------------------------------------
// 21. Busiest-day window boundary: +6 included, +7 excluded
//
// (Static-review follow-up: the near-term window already had explicit
// inclusive/exclusive boundary tests — tests 7/8 above — but the
// busiest-day window's own 0..6 boundary did not.)
// ---------------------------------------------------------------------
test("computeSmartInsights: two activities due exactly 6 days out are included in the busiest-day window", () => {
  const sixDaysOut = addDaysToDateStr("2026-04-10", 6);
  const insights = computeSmartInsights({
    activities: [
      activity({ id: "a1", computedStatus: "pending", deadline: sixDaysOut }),
      activity({ id: "a2", computedStatus: "pending", deadline: sixDaysOut }),
    ],
    now: NOW,
  });
  const busiest = findInsight(insights, "busiest_upcoming_day");
  assert.ok(busiest, "expected a busiest-upcoming-day insight for a +6 day deadline");
  assert.equal(busiest.date, sixDaysOut);
  assert.equal(busiest.count, 2);
  assert.equal(busiest.dayOffset, 6);
});

test("computeSmartInsights: activities due exactly 7 days out never participate in the busiest-day window, even when they would otherwise dominate the count", () => {
  const sixDaysOut = addDaysToDateStr("2026-04-10", 6);
  const sevenDaysOut = addDaysToDateStr("2026-04-10", 7);
  const insights = computeSmartInsights({
    activities: [
      // In range (offset 6): exactly 2 — the minimum to qualify.
      activity({ id: "a1", computedStatus: "pending", deadline: sixDaysOut }),
      activity({ id: "a2", computedStatus: "pending", deadline: sixDaysOut }),
      // Out of range (offset 7): a LARGER count (3) than the in-range
      // date. If the window were ever accidentally widened to 0..7,
      // this date would incorrectly win as "busiest" (3 > 2) instead of
      // being excluded entirely — so this test fails loudly under that
      // exact off-by-one, rather than merely passing by coincidence.
      activity({ id: "b1", computedStatus: "pending", deadline: sevenDaysOut }),
      activity({ id: "b2", computedStatus: "pending", deadline: sevenDaysOut }),
      activity({ id: "b3", computedStatus: "pending", deadline: sevenDaysOut }),
    ],
    now: NOW,
  });
  const busiest = findInsight(insights, "busiest_upcoming_day");
  assert.ok(busiest, "expected a busiest-upcoming-day insight from the in-range +6 day date");
  assert.equal(busiest.date, sixDaysOut);
  assert.equal(busiest.count, 2);
  assert.equal(busiest.dayOffset, 6);
});

// ---------------------------------------------------------------------
// 22. Purity / mutation safety: neither activities nor now are mutated
//
// (Static-review follow-up: test 16 showed repeated calls return
// consistent output, which is only indirect evidence of non-mutation —
// this test directly snapshots the caller-owned input before the call
// and asserts it is byte-for-byte unchanged after, testing only
// computeSmartInsights' public behavior.)
// ---------------------------------------------------------------------
test("computeSmartInsights: does not mutate the input activities array/objects or the supplied now Date", () => {
  const activities = [
    activity({ id: "a1", computedStatus: "overdue", deadline: addDaysToDateStr("2026-04-10", -2) }),
    activity({ id: "a2", computedStatus: "pending", deadline: "2026-04-10" }),
    activity({ id: "a3", computedStatus: "pending", deadline: addDaysToDateStr("2026-04-10", 6) }),
    activity({ id: "a4", computedStatus: "pending", deadline: addDaysToDateStr("2026-04-10", 6) }),
    activity({ id: "a5", computedStatus: "completed", deadline: "2026-04-10" }),
  ];
  // A deep, independent snapshot taken BEFORE the call — plain
  // string/number/boolean fields only, so a JSON round-trip is lossless
  // and gives a value fully disconnected from the original objects/
  // array (unlike comparing against `activities` itself afterward,
  // which would trivially "pass" even if the array were mutated in
  // place, since both sides would be the same mutated reference).
  const activitiesSnapshotBefore = JSON.parse(JSON.stringify(activities));
  const originalLength = activities.length;

  const now = new Date(2026, 3, 10); // a Date object owned by this test only
  const nowTimeBefore = now.getTime();

  computeSmartInsights({ activities, now });

  assert.equal(activities.length, originalLength, "the input array's length must be unchanged");
  assert.deepEqual(activities, activitiesSnapshotBefore, "no input activity object may be mutated");
  assert.equal(now.getTime(), nowTimeBefore, "the supplied now Date must be unchanged");
});
