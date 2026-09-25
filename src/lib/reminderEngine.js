// Phase 9E Stage 9E-4B: server-capable reminder computation engine
// (computation only — nothing here sends anything).
//
// Pure module: no React, no DOM, no localStorage, no browser Notification
// API, no Supabase client, no service-role key, no environment-variable
// access, no network calls. Every export takes plain data in and returns
// plain data out, so the exact same functions can run inside a browser
// tab (a later stage may have App.jsx import these to de-duplicate its
// own logic) or inside a future Node/Vercel serverless function (Stage
// 9E-4C) without any adaptation.
//
// This module intentionally REIMPLEMENTS — rather than imports from —
// the equivalent logic already living in src/App.jsx (computeStatus/
// urgency, reminderRelevantActivities, currentSemesterSubjectIds/
// currentSemesterSchedules, isDateWithinSemesterRange,
// getDueClassReminders and their dedup key shapes). App.jsx is not
// touched in this stage: nothing yet consumes this engine, so there is
// zero risk of changing the existing foreground notification behavior.
// Unifying the two (App.jsx importing these helpers instead of its own
// copies) is deliberately deferred to Stage 9E-4D, where the foreground/
// background dedup integration actually needs the two to share one
// implementation. Every semantic choice below is written to match
// App.jsx's current behavior exactly; see the inline comments for the
// specific App.jsx logic each function mirrors.

// ---------------------------------------------------------------------
// Timezone resolution
//
// profiles.timezone (Stage 9E-4A) is nullable and carries no default —
// a user with no stored timezone, or a stored value that isn't a real
// IANA zone name, must produce ZERO automatic candidates. This module
// never falls back to the executing server's own timezone: every date/
// time computation below is derived from getLocalDateTimeParts, which
// requires an explicit, validated IANA zone.
// ---------------------------------------------------------------------

// The standard, dependency-free way to validate an IANA zone name:
// Intl.DateTimeFormat throws a RangeError for any string that isn't a
// real zone identifier its ICU data recognizes. No timezone package is
// added — this uses only what the JS platform already provides.
export function isValidIanaTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.trim() === "") return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Reads a single instant's wall-clock Y/M/D/H/M/S AS OBSERVED in
// `timeZone`, using Intl's own IANA tzdata (so DST transitions are
// handled correctly with zero extra logic/dependency). `instant` is a
// plain JS Date (an absolute point in time — epoch milliseconds); the
// returned parts are that instant's local calendar/clock reading in the
// given zone, nothing more.
function getLocalDateTimeParts(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map = {};
  for (const part of formatter.formatToParts(instant)) {
    map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

// Y/M/D calendar date -> epoch milliseconds AT UTC MIDNIGHT of that
// date. Used purely as an arithmetic anchor for day-difference and
// weekday computation below — never reinterpreted as "the moment in
// UTC," and never mixed with real UTC instants. Because both sides of
// every comparison in this module go through this same anchor, the
// arithmetic is exact and independent of both DST and whatever
// timezone the Node process executing this code happens to be in.
function utcAnchorMs({ year, month, day }) {
  return Date.UTC(year, month - 1, day);
}

// A calendar date's day-of-week is a property of the date itself, not
// of any timezone — reading it off the UTC-midnight anchor is exact.
// 0 = Sunday ... 6 = Saturday, matching subject_schedules.day_of_week
// and JS's own Date.getDay() convention already used throughout
// App.jsx.
function dayOfWeekFromParts(parts) {
  return new Date(utcAnchorMs(parts)).getUTCDay();
}

// Whole-day difference between two Y/M/D calendar dates (to - from),
// exact and DST-independent (see utcAnchorMs above) — the same
// quantity App.jsx's urgency() computes via
// `Math.round((due - today) / 86400000)`, just sourced from validated
// Y/M/D parts instead of two local Date objects.
function daysBetweenParts(fromParts, toParts) {
  return Math.round((utcAnchorMs(toParts) - utcAnchorMs(fromParts)) / 86400000);
}

function formatDateStrFromParts({ year, month, day }) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// Strict "YYYY-MM-DD" -> {year, month, day}. Returns null for anything
// malformed rather than silently producing NaN comparisons — a
// malformed activities.deadline or semesters.start_date/end_date must
// never crash the engine or be treated as "always due."
function parseDateStrParts(dateStr) {
  if (typeof dateStr !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

// Public entry point for "what is this user's local date/time right
// now": returns null whenever `timeZone` is missing or invalid — the
// single choke point every candidate-producing function below goes
// through, guaranteeing "no valid timezone -> no candidates of any
// kind" rather than requiring every caller to remember to check.
export function resolveUserLocalNow(instant, timeZone) {
  if (!isValidIanaTimeZone(timeZone)) return null;
  const at = instant instanceof Date && !Number.isNaN(instant.getTime()) ? instant : new Date();
  const parts = getLocalDateTimeParts(at, timeZone);
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    dateStr: formatDateStrFromParts(parts),
    dayOfWeek: dayOfWeekFromParts(parts),
    minutesSinceMidnight: parts.hour * 60 + parts.minute,
  };
}

// ---------------------------------------------------------------------
// Semester scoping — mirrors App.jsx's activeSemesterId (App.jsx
// ~line 313), reminderRelevantActivities (~line 465),
// currentSemesterSubjectIds/currentSemesterSchedules (~line 482) field
// for field. This is the exact rule Stage 9E-4A's audit fixed as
// required:
//   - zero semesters ever created -> legacy null-semesterId rows are
//     relevant
//   - semesters exist but none is active -> nothing is relevant
//   - an active semester exists -> only rows belonging to it
// selectedSemesterId (the transient "what's being browsed" UI state)
// never appears anywhere in this module — it has no server-side
// equivalent and must never influence background computation.
//
// Archived semesters need no separate exclusion here: the semesters
// table's own `semesters_not_active_and_archived` CHECK constraint
// (Stage 8 migration) makes it impossible for an archived semester to
// ever be is_active — so "the active semester" can structurally never
// be an archived one, and an archived semester's records can never
// match activeSemesterId below.
// ---------------------------------------------------------------------

export function resolveActiveSemesterId(semesters) {
  const list = Array.isArray(semesters) ? semesters : [];
  const active = list.find((semester) => semester && semester.isActive === true);
  return active ? active.id : null;
}

export function filterReminderRelevantActivities(activities, semesters) {
  const activityList = Array.isArray(activities) ? activities : [];
  const semesterList = Array.isArray(semesters) ? semesters : [];

  if (semesterList.length === 0) {
    return activityList.filter((activity) => (activity?.semesterId ?? null) === null);
  }

  const activeSemesterId = resolveActiveSemesterId(semesterList);
  if (activeSemesterId === null) return [];

  return activityList.filter((activity) => activity?.semesterId === activeSemesterId);
}

export function resolveCurrentSemesterSubjectIds(subjects, semesters) {
  const subjectList = Array.isArray(subjects) ? subjects : [];
  const semesterList = Array.isArray(semesters) ? semesters : [];

  if (semesterList.length === 0) {
    return new Set(
      subjectList.filter((subject) => (subject?.semesterId ?? null) === null).map((subject) => subject.id)
    );
  }

  const activeSemesterId = resolveActiveSemesterId(semesterList);
  if (activeSemesterId === null) return new Set();

  return new Set(
    subjectList.filter((subject) => subject?.semesterId === activeSemesterId).map((subject) => subject.id)
  );
}

export function filterCurrentSemesterSchedules(subjectSchedules, currentSemesterSubjectIds) {
  const scheduleList = Array.isArray(subjectSchedules) ? subjectSchedules : [];
  return scheduleList.filter((row) => currentSemesterSubjectIds.has(row?.subjectId));
}

// Mirrors App.jsx's isDateWithinSemesterRange (~line 2769): a missing
// bound is unbounded on that side; a null/undefined semester (the
// zero-semester or "no active semester" case) is always unbounded.
export function isLocalDateWithinSemesterRange(localDateParts, semester) {
  if (!semester) return true;
  const dayMs = utcAnchorMs(localDateParts);

  if (semester.startDate) {
    const startParts = parseDateStrParts(semester.startDate);
    if (startParts && dayMs < utcAnchorMs(startParts)) return false;
  }
  if (semester.endDate) {
    const endParts = parseDateStrParts(semester.endDate);
    if (endParts && dayMs > utcAnchorMs(endParts)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------
// Activity deadline reminders — mirrors App.jsx's urgency() (~line 138)
// and the Stage 9B device-notification effect's notifiable set
// (overdue/today/tomorrow only — "week"/"later" never notify).
// ---------------------------------------------------------------------

const ACTIVITY_URGENCY_KEYS_THAT_NOTIFY = new Set(["overdue", "today", "tomorrow"]);

// Same five outcomes as App.jsx's urgency(), computed from validated
// Y/M/D parts instead of two local Date objects. Returns null (never a
// candidate) for a completed activity or an unparsable deadline.
export function computeActivityUrgencyKey(activity, userLocalNow) {
  if (!activity || activity.status === "completed") return null;

  const deadlineParts = parseDateStrParts(activity.deadline);
  if (!deadlineParts) return null;

  const diffDays = daysBetweenParts(userLocalNow, deadlineParts);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return "week";
  return "later";
}

// Identical shape to App.jsx's existing dedup key:
// `${activity.id}|${activity.urgencyKey}|${activity.deadline}|${todayKey}`
// — kept byte-for-byte compatible so a later stage can safely treat a
// key produced here and a key produced in the browser as the same
// event, without any translation layer.
export function buildActivityDedupKey(activityId, urgencyKey, deadline, localToday) {
  return `${activityId}|${urgencyKey}|${deadline}|${localToday}`;
}

// Each activities row is already an independently completable,
// materialized occurrence (recurring or not) — Stage 9C's
// recurrence_series_id/recurrence_rule are inert grouping tags this
// engine never reads. No second recurrence engine exists or is needed
// here: every row is evaluated exactly as it is stored.
export function computeActivityReminderCandidates({ activities, semesters, userLocalNow }) {
  if (!userLocalNow) return [];

  const relevant = filterReminderRelevantActivities(activities, semesters);
  const candidates = [];

  for (const activity of relevant) {
    const urgencyKey = computeActivityUrgencyKey(activity, userLocalNow);
    if (!urgencyKey || !ACTIVITY_URGENCY_KEYS_THAT_NOTIFY.has(urgencyKey)) continue;

    candidates.push({
      kind: "activity",
      category: `activity_${urgencyKey === "today" ? "due_today" : urgencyKey === "tomorrow" ? "due_tomorrow" : "overdue"}`,
      sourceId: activity.id,
      activityId: activity.id,
      subjectId: activity.subjectId ?? null,
      semesterId: activity.semesterId ?? null,
      title: activity.title,
      deadline: activity.deadline,
      urgencyKey,
      localDate: userLocalNow.dateStr,
      dedupKey: buildActivityDedupKey(activity.id, urgencyKey, activity.deadline, userLocalNow.dateStr),
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------
// Class schedule reminders — mirrors App.jsx's Stage 9D-5
// getDueClassReminders (~line 4004) as closely as possible, sourced
// from the user's own local wall-clock time instead of the browser's
// implicit local time.
// ---------------------------------------------------------------------

// subject_schedules.start_time/end_time come back from Postgres as
// "HH:MM:SS" (TIME WITHOUT TIME ZONE) — a plain recurring local
// wall-clock value, never UTC. This parses only the HH:MM prefix into
// minutes-since-midnight; returns null (never a candidate) for
// anything malformed rather than guessing.
function parseHhMmToMinutes(timeStr) {
  if (typeof timeStr !== "string") return null;
  const match = /^(\d{2}):(\d{2})/.exec(timeStr);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

// Identical shape to App.jsx's existing classReminderDedupKey:
// `class|${scheduleId}|${formatLocalDate(occurrenceDate)}|${reminderMinutes}`.
export function buildClassDedupKey(scheduleId, occurrenceLocalDate, reminderMinutes) {
  return `class|${scheduleId}|${occurrenceLocalDate}|${reminderMinutes}`;
}

// CRON-TOLERANCE DESIGN NOTE: this deliberately reuses — rather than
// invents — Stage 9D-5's existing grace-window eligibility rule:
// eligible any time from the reminder's target minute up until the
// class's own end time (`target <= now < classEnd`), not just the
// single exact target minute. A scheduled execution that runs every
// few minutes and lands a little after the exact target minute still
// finds the class eligible, because the window stays open until the
// class ends. This is already how the foreground engine behaves today
// (App.jsx ~line 4017) — nothing new is being introduced for
// scheduling purposes; actual duplicate suppression across repeated
// executions is reminder_deliveries's job (Stage 9E-4A), not this
// engine's.
export function computeClassReminderCandidates({ subjects, subjectSchedules, semesters, userLocalNow }) {
  if (!userLocalNow) return [];

  const subjectList = Array.isArray(subjects) ? subjects : [];
  const semesterList = Array.isArray(semesters) ? semesters : [];

  const activeSemesterId = resolveActiveSemesterId(semesterList);
  const activeSemester = activeSemesterId
    ? semesterList.find((semester) => semester.id === activeSemesterId) || null
    : null;

  const currentSubjectIds = resolveCurrentSemesterSubjectIds(subjectList, semesterList);
  const currentSchedules = filterCurrentSemesterSchedules(subjectSchedules, currentSubjectIds);

  // Same redundant-but-harmless double check App.jsx performs: schedules
  // are already scoped to the active semester's subjects above, and this
  // additionally requires today itself to fall inside that semester's
  // own start_date/end_date range.
  if (!isLocalDateWithinSemesterRange(userLocalNow, activeSemester)) return [];

  const subjectMap = {};
  for (const subject of subjectList) {
    if (subject && subject.id != null) subjectMap[subject.id] = subject;
  }

  const candidates = [];

  for (const row of currentSchedules) {
    if (!row || row.notificationsEnabled !== true) continue;
    if (row.dayOfWeek !== userLocalNow.dayOfWeek) continue;

    const startMinutes = parseHhMmToMinutes(row.startTime);
    const endMinutes = parseHhMmToMinutes(row.endTime);
    if (startMinutes === null || endMinutes === null) continue;

    const reminderMinutes = Number.isFinite(row.reminderMinutes) ? row.reminderMinutes : Number(row.reminderMinutes) || 0;
    const targetMinutes = startMinutes - reminderMinutes;

    const now = userLocalNow.minutesSinceMidnight;
    if (now < targetMinutes || now >= endMinutes) continue;

    const subject = subjectMap[row.subjectId] || null;

    candidates.push({
      kind: "class",
      category: "class_schedule",
      sourceId: row.id,
      scheduleId: row.id,
      subjectId: row.subjectId ?? null,
      subjectName: subject?.name ?? null,
      semesterId: subject?.semesterId ?? null,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      reminderMinutes,
      location: row.location || "",
      localDate: userLocalNow.dateStr,
      dedupKey: buildClassDedupKey(row.id, userLocalNow.dateStr, reminderMinutes),
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------

// `now` defaults to the real current instant; passing an explicit Date
// is how tests (and, later, a scheduled function) get deterministic
// behavior. `timezone` must be an explicit IANA zone string — there is
// no default and no fallback. Returns empty candidate lists (never an
// error/throw) whenever the timezone is missing/invalid, exactly as
// required: a user with no stored/valid timezone gets zero automatic
// reminders rather than a guess.
export function computeReminderCandidates({
  now,
  timezone,
  activities = [],
  subjects = [],
  subjectSchedules = [],
  semesters = [],
} = {}) {
  const userLocalNow = resolveUserLocalNow(now, timezone);

  if (!userLocalNow) {
    return {
      timezoneValid: false,
      localToday: null,
      activityCandidates: [],
      classCandidates: [],
      candidates: [],
    };
  }

  const activityCandidates = computeActivityReminderCandidates({ activities, semesters, userLocalNow });
  const classCandidates = computeClassReminderCandidates({ subjects, subjectSchedules, semesters, userLocalNow });

  return {
    timezoneValid: true,
    localToday: userLocalNow.dateStr,
    activityCandidates,
    classCandidates,
    candidates: [...activityCandidates, ...classCandidates],
  };
}
