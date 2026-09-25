// Phase 9E Stage 9E-4B: focused tests for the pure reminder engine.
//
// Uses only Node's built-in test runner (node:test) and assert module —
// zero added dependencies, per the stage's "use built-in platform
// capabilities" instruction. Run with:
//
//   node --test src/lib/__tests__/reminderEngine.test.js
//
// Every date/time input below is derived FROM the engine's own
// resolveUserLocalNow output (never hand-computed calendar/weekday
// math), so these tests stay correct regardless of which fixed instant
// is chosen and never depend on the machine running them having any
// particular timezone.

import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidIanaTimeZone,
  resolveUserLocalNow,
  resolveActiveSemesterId,
  computeActivityUrgencyKey,
  buildActivityDedupKey,
  buildClassDedupKey,
  computeActivityReminderCandidates,
  computeClassReminderCandidates,
  computeReminderCandidates,
} from "../reminderEngine.js";

// A fixed instant, deliberately not near a Manila-local midnight
// boundary, used as the default "now" for tests that don't care about
// the UTC/local date-boundary case specifically.
const FIXED_NOW = new Date("2026-06-15T04:00:00.000Z"); // 12:00 Manila time, same calendar day
const TZ_MANILA = "Asia/Manila";
const TZ_NEW_YORK = "America/New_York";

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function minutesToHhMmSs(totalMinutes) {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function activity(overrides = {}) {
  return {
    id: "act-1",
    subjectId: "sub-1",
    title: "Sample activity",
    deadline: "2026-06-15",
    status: "pending",
    semesterId: null,
    ...overrides,
  };
}

function subject(overrides = {}) {
  return { id: "sub-1", name: "Sample Subject", semesterId: null, ...overrides };
}

function scheduleRow(overrides = {}) {
  return {
    id: "sched-1",
    subjectId: "sub-1",
    dayOfWeek: 1,
    startTime: "09:00:00",
    endTime: "10:00:00",
    location: "",
    reminderMinutes: 15,
    notificationsEnabled: true,
    ...overrides,
  };
}

function semester(overrides = {}) {
  return {
    id: "sem-1",
    name: "First Semester",
    startDate: null,
    endDate: null,
    isActive: false,
    archivedAt: null,
    ...overrides,
  };
}

// ------------------------------------------------------------------
// Timezone resolution
// ------------------------------------------------------------------

test("timezone: missing timezone -> no automatic candidates", () => {
  const result = computeReminderCandidates({
    now: FIXED_NOW,
    timezone: undefined,
    activities: [activity()],
  });
  assert.equal(result.timezoneValid, false);
  assert.equal(result.localToday, null);
  assert.deepEqual(result.candidates, []);
});

test("timezone: null timezone -> no automatic candidates", () => {
  const result = computeReminderCandidates({
    now: FIXED_NOW,
    timezone: null,
    activities: [activity()],
  });
  assert.equal(result.timezoneValid, false);
  assert.deepEqual(result.candidates, []);
});

test("timezone: invalid timezone string -> no automatic candidates", () => {
  assert.equal(isValidIanaTimeZone("Not/A_Real_Zone"), false);
  const result = computeReminderCandidates({
    now: FIXED_NOW,
    timezone: "Not/A_Real_Zone",
    activities: [activity()],
  });
  assert.equal(result.timezoneValid, false);
  assert.deepEqual(result.candidates, []);
});

test("timezone: valid Asia/Manila resolves a local date", () => {
  const local = resolveUserLocalNow(FIXED_NOW, TZ_MANILA);
  assert.ok(local);
  assert.equal(local.dateStr, "2026-06-15");
});

test("timezone: valid America/New_York resolves a local date", () => {
  const local = resolveUserLocalNow(FIXED_NOW, TZ_NEW_YORK);
  assert.ok(local);
  // 04:00 UTC in June (EDT, UTC-4) is still 2026-06-15 local (00:00).
  assert.equal(local.dateStr, "2026-06-15");
});

test("timezone: local date can differ from the UTC calendar date (Manila ahead of UTC)", () => {
  // 17:00 UTC + 8h (Manila) = 01:00 the NEXT calendar day locally.
  const boundaryInstant = new Date("2026-06-15T17:00:00.000Z");
  const local = resolveUserLocalNow(boundaryInstant, TZ_MANILA);
  assert.equal(local.dateStr, "2026-06-16");
});

test("timezone: local date can differ from the UTC calendar date (New York behind UTC)", () => {
  // 02:00 UTC - 4h (EDT) = 22:00 the PREVIOUS calendar day locally.
  const boundaryInstant = new Date("2026-06-16T02:00:00.000Z");
  const local = resolveUserLocalNow(boundaryInstant, TZ_NEW_YORK);
  assert.equal(local.dateStr, "2026-06-15");
});

// ------------------------------------------------------------------
// Activity reminders
// ------------------------------------------------------------------

const localNowManila = resolveUserLocalNow(FIXED_NOW, TZ_MANILA);
const TODAY = localNowManila.dateStr;

test("activities: overdue pending activity -> candidate", () => {
  const result = computeActivityReminderCandidates({
    activities: [activity({ id: "a-overdue", deadline: addDaysToDateStr(TODAY, -1) })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].urgencyKey, "overdue");
  assert.equal(result[0].category, "activity_overdue");
});

test("activities: due today -> candidate", () => {
  const result = computeActivityReminderCandidates({
    activities: [activity({ id: "a-today", deadline: TODAY })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].urgencyKey, "today");
  assert.equal(result[0].category, "activity_due_today");
});

test("activities: due tomorrow -> candidate", () => {
  const result = computeActivityReminderCandidates({
    activities: [activity({ id: "a-tomorrow", deadline: addDaysToDateStr(TODAY, 1) })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].urgencyKey, "tomorrow");
  assert.equal(result[0].category, "activity_due_tomorrow");
});

test("activities: completed activity -> no candidate", () => {
  const result = computeActivityReminderCandidates({
    activities: [activity({ id: "a-done", deadline: TODAY, status: "completed" })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.deepEqual(result, []);
});

test("activities: future beyond tomorrow -> no candidate", () => {
  const result = computeActivityReminderCandidates({
    activities: [activity({ id: "a-later", deadline: addDaysToDateStr(TODAY, 10) })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.deepEqual(result, []);
});

test("activities: zero semesters + null-semester activity -> candidate", () => {
  const result = computeActivityReminderCandidates({
    activities: [activity({ id: "a-legacy", deadline: TODAY, semesterId: null })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result.length, 1);
});

test("activities: semesters exist but none active -> no candidates", () => {
  const result = computeActivityReminderCandidates({
    activities: [activity({ id: "a-1", deadline: TODAY, semesterId: "sem-1" })],
    semesters: [semester({ id: "sem-1", isActive: false })],
    userLocalNow: localNowManila,
  });
  assert.deepEqual(result, []);
});

test("activities: active semester -> only matching-semester activities", () => {
  const result = computeActivityReminderCandidates({
    activities: [
      activity({ id: "a-match", deadline: TODAY, semesterId: "sem-1" }),
      activity({ id: "a-other", deadline: TODAY, semesterId: "sem-2" }),
      activity({ id: "a-legacy", deadline: TODAY, semesterId: null }),
    ],
    semesters: [semester({ id: "sem-1", isActive: true }), semester({ id: "sem-2", isActive: false })],
    userLocalNow: localNowManila,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].activityId, "a-match");
});

test("activities: archived semester's records -> no candidates", () => {
  // An archived semester can never itself be is_active (DB CHECK
  // constraint), so with a *different* semester active, the archived
  // semester's own activities must never surface.
  const result = computeActivityReminderCandidates({
    activities: [activity({ id: "a-archived", deadline: TODAY, semesterId: "sem-archived" })],
    semesters: [
      semester({ id: "sem-archived", isActive: false, archivedAt: "2026-01-01T00:00:00.000Z" }),
      semester({ id: "sem-1", isActive: true }),
    ],
    userLocalNow: localNowManila,
  });
  assert.deepEqual(result, []);
});

// ------------------------------------------------------------------
// Dedup keys
// ------------------------------------------------------------------

test("dedup: activity dedup key is deterministic and matches the existing App.jsx shape", () => {
  const key1 = buildActivityDedupKey("act-1", "today", "2026-06-15", "2026-06-15");
  const key2 = buildActivityDedupKey("act-1", "today", "2026-06-15", "2026-06-15");
  assert.equal(key1, key2);
  assert.equal(key1, "act-1|today|2026-06-15|2026-06-15");
});

test("dedup: class dedup key is deterministic and matches the existing App.jsx shape", () => {
  const key1 = buildClassDedupKey("sched-1", "2026-06-15", 15);
  const key2 = buildClassDedupKey("sched-1", "2026-06-15", 15);
  assert.equal(key1, key2);
  assert.equal(key1, "class|sched-1|2026-06-15|15");
});

// ------------------------------------------------------------------
// Class reminders
// ------------------------------------------------------------------

function withinWindowSchedule(overrides = {}) {
  // startTime a little before "now", endTime a little after "now",
  // reminderMinutes small enough that target (start - reminderMinutes)
  // is already in the past relative to "now" -> currently eligible.
  const startMinutes = localNowManila.minutesSinceMidnight + 5;
  const endMinutes = localNowManila.minutesSinceMidnight + 60;
  return scheduleRow({
    dayOfWeek: localNowManila.dayOfWeek,
    startTime: minutesToHhMmSs(startMinutes),
    endTime: minutesToHhMmSs(endMinutes),
    reminderMinutes: 15,
    ...overrides,
  });
}

test("classes: matching weekday and reminder window -> candidate", () => {
  const result = computeClassReminderCandidates({
    subjects: [subject()],
    subjectSchedules: [withinWindowSchedule()],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].scheduleId, "sched-1");
});

test("classes: notifications_enabled false -> none", () => {
  const result = computeClassReminderCandidates({
    subjects: [subject()],
    subjectSchedules: [withinWindowSchedule({ notificationsEnabled: false })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.deepEqual(result, []);
});

test("classes: wrong weekday -> none", () => {
  const result = computeClassReminderCandidates({
    subjects: [subject()],
    subjectSchedules: [withinWindowSchedule({ dayOfWeek: (localNowManila.dayOfWeek + 1) % 7 })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.deepEqual(result, []);
});

test("classes: outside semester date range -> none", () => {
  const result = computeClassReminderCandidates({
    subjects: [subject({ semesterId: "sem-1" })],
    subjectSchedules: [withinWindowSchedule({ subjectId: "sub-1" })],
    semesters: [
      semester({
        id: "sem-1",
        isActive: true,
        startDate: addDaysToDateStr(TODAY, 1), // starts tomorrow -> today is out of range
        endDate: addDaysToDateStr(TODAY, 30),
      }),
    ],
    userLocalNow: localNowManila,
  });
  assert.deepEqual(result, []);
});

test("classes: reminder_minutes = 0 (at class time) still respects the window", () => {
  const startMinutes = localNowManila.minutesSinceMidnight; // starts exactly now
  const endMinutes = localNowManila.minutesSinceMidnight + 60;
  const result = computeClassReminderCandidates({
    subjects: [subject()],
    subjectSchedules: [
      scheduleRow({
        dayOfWeek: localNowManila.dayOfWeek,
        startTime: minutesToHhMmSs(startMinutes),
        endTime: minutesToHhMmSs(endMinutes),
        reminderMinutes: 0,
      }),
    ],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].reminderMinutes, 0);
});

test("classes: reminder_minutes 5/15/30/60 each independently produce a candidate when in window", () => {
  for (const reminderMinutes of [5, 15, 30, 60]) {
    const startMinutes = localNowManila.minutesSinceMidnight + reminderMinutes - 1; // target is 1 minute ago
    const endMinutes = startMinutes + 60;
    const result = computeClassReminderCandidates({
      subjects: [subject()],
      subjectSchedules: [
        scheduleRow({
          id: `sched-${reminderMinutes}`,
          dayOfWeek: localNowManila.dayOfWeek,
          startTime: minutesToHhMmSs(startMinutes),
          endTime: minutesToHhMmSs(endMinutes),
          reminderMinutes,
        }),
      ],
      semesters: [],
      userLocalNow: localNowManila,
    });
    assert.equal(result.length, 1, `expected a candidate for reminderMinutes=${reminderMinutes}`);
    assert.equal(result[0].reminderMinutes, reminderMinutes);
  }
});

test("classes: location is included on the candidate when present", () => {
  const result = computeClassReminderCandidates({
    subjects: [subject()],
    subjectSchedules: [withinWindowSchedule({ location: "Room 204" })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result[0].location, "Room 204");
});

test("classes: location is an empty string, not undefined/null, when absent", () => {
  const result = computeClassReminderCandidates({
    subjects: [subject()],
    subjectSchedules: [withinWindowSchedule({ location: null })],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result[0].location, "");
});

test("classes: multiple schedules remain independent", () => {
  const scheduleA = withinWindowSchedule({ id: "sched-a", subjectId: "sub-a" });
  const scheduleB = withinWindowSchedule({ id: "sched-b", subjectId: "sub-b", notificationsEnabled: false });
  const result = computeClassReminderCandidates({
    subjects: [subject({ id: "sub-a" }), subject({ id: "sub-b" })],
    subjectSchedules: [scheduleA, scheduleB],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].scheduleId, "sched-a");
});

test("classes: semesters exist but none active -> none", () => {
  const result = computeClassReminderCandidates({
    subjects: [subject({ semesterId: "sem-1" })],
    subjectSchedules: [withinWindowSchedule()],
    semesters: [semester({ id: "sem-1", isActive: false })],
    userLocalNow: localNowManila,
  });
  assert.deepEqual(result, []);
});

test("classes: zero-semester legacy subject/schedule -> candidate (matches current app behavior)", () => {
  const result = computeClassReminderCandidates({
    subjects: [subject({ semesterId: null })],
    subjectSchedules: [withinWindowSchedule()],
    semesters: [],
    userLocalNow: localNowManila,
  });
  assert.equal(result.length, 1);
});

// ------------------------------------------------------------------
// Top-level integration
// ------------------------------------------------------------------

test("computeReminderCandidates: combines activity and class candidates for a valid timezone", () => {
  const result = computeReminderCandidates({
    now: FIXED_NOW,
    timezone: TZ_MANILA,
    activities: [activity({ id: "a-today", deadline: TODAY })],
    subjects: [subject()],
    subjectSchedules: [withinWindowSchedule()],
    semesters: [],
  });
  assert.equal(result.timezoneValid, true);
  assert.equal(result.localToday, TODAY);
  assert.equal(result.activityCandidates.length, 1);
  assert.equal(result.classCandidates.length, 1);
  assert.equal(result.candidates.length, 2);
});

test("resolveActiveSemesterId: null when no semester is active, id when one is", () => {
  assert.equal(resolveActiveSemesterId([]), null);
  assert.equal(resolveActiveSemesterId([semester({ id: "sem-1", isActive: false })]), null);
  assert.equal(resolveActiveSemesterId([semester({ id: "sem-1", isActive: true })]), "sem-1");
});

test("computeActivityUrgencyKey: null for an unparsable deadline (never a candidate)", () => {
  const key = computeActivityUrgencyKey(activity({ deadline: "not-a-date" }), localNowManila);
  assert.equal(key, null);
});
