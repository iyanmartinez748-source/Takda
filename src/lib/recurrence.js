// Phase 9C Stage 9C-3: pure recurrence date-generation foundation.
//
// This module only computes dates. It has no React dependency, never
// touches Supabase/localStorage, never generates activity ids or
// objects, and knows nothing about subjects, semesters, Free/Pro
// quota, or reminders/notifications — it is not wired into
// saveActivity or any UI in this stage.
//
// Dates are local calendar dates ("YYYY-MM-DD"), never parsed via
// `new Date(str)` (which parses as UTC midnight and can drift a day in
// timezones behind UTC). This mirrors the exact local-date approach
// App.jsx already uses for activity deadlines (parseLocalDate /
// formatLocalDate), reimplemented here so this module stays
// self-contained and dependency-free.

export const RECURRENCE_RULES = ["daily", "weekdays", "weekends", "weekly"];
const VALID_RULES = new Set(RECURRENCE_RULES);

const MAX_OCCURRENCES = 50;

export class RecurrenceValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "RecurrenceValidationError";
    this.code = code;
  }
}

// Strict local "YYYY-MM-DD" parse. Unlike App.jsx's parseLocalDate (which
// tolerates malformed input for display purposes), this rejects anything
// that isn't a real calendar date — including a value like "2026-02-30"
// that the Date constructor would otherwise silently roll forward into
// March. Returns null on any invalid input rather than throwing, so
// callers can attach their own field-specific error.
function parseLocalDateStrict(dateStr) {
  if (typeof dateStr !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // JS Date silently rolls invalid day/month combinations into the next
  // month — comparing the constructed date's own fields back against the
  // input catches that instead of accepting a rolled-over date.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

// The exact inverse of parseLocalDateStrict, matching App.jsx's
// formatLocalDate: builds "YYYY-MM-DD" from a Date's own local Y/M/D
// getters, never via toISOString() (which is UTC-based).
function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Generates the ordered list of local calendar dates ("YYYY-MM-DD") a
 * recurrence rule produces between startDate and repeatUntil, inclusive.
 *
 * - daily: every calendar day in the range.
 * - weekdays: only Mon–Fri days in the range (the start date is only
 *   included if it happens to be a weekday).
 * - weekends: only Sat/Sun days in the range (the start date is only
 *   included if it happens to be a weekend day).
 * - weekly: every 7th day starting from startDate.
 *
 * Throws RecurrenceValidationError for missing/invalid input,
 * startDate > repeatUntil, or a result that would exceed 50 occurrences
 * (never silently truncated). A range with zero matching occurrences
 * (e.g. a single weekday requested for "weekends") is a valid empty
 * array, not an error.
 */
export function generateRecurrenceDates({ startDate, repeatUntil, recurrenceRule } = {}) {
  if (!startDate) {
    throw new RecurrenceValidationError("A start date is required.", "missing_start_date");
  }
  if (!repeatUntil) {
    throw new RecurrenceValidationError("A repeat-until date is required.", "missing_repeat_until");
  }
  if (!VALID_RULES.has(recurrenceRule)) {
    throw new RecurrenceValidationError(
      `Unsupported recurrence rule: ${recurrenceRule}`,
      "invalid_recurrence_rule"
    );
  }

  const start = parseLocalDateStrict(startDate);
  if (!start) {
    throw new RecurrenceValidationError(`Invalid start date: ${startDate}`, "invalid_start_date");
  }
  const until = parseLocalDateStrict(repeatUntil);
  if (!until) {
    throw new RecurrenceValidationError(`Invalid repeat-until date: ${repeatUntil}`, "invalid_repeat_until");
  }
  if (start.getTime() > until.getTime()) {
    throw new RecurrenceValidationError(
      "The start date must be on or before the repeat-until date.",
      "start_after_repeat_until"
    );
  }

  const stepDays = recurrenceRule === "weekly" ? 7 : 1;
  const dates = [];
  const cursor = new Date(start.getTime());

  while (cursor.getTime() <= until.getTime()) {
    const dayOfWeek = cursor.getDay(); // 0 = Sunday ... 6 = Saturday
    const isMatch =
      recurrenceRule === "daily" ||
      recurrenceRule === "weekly" ||
      (recurrenceRule === "weekdays" && dayOfWeek >= 1 && dayOfWeek <= 5) ||
      (recurrenceRule === "weekends" && (dayOfWeek === 0 || dayOfWeek === 6));

    if (isMatch) {
      if (dates.length === MAX_OCCURRENCES) {
        throw new RecurrenceValidationError(
          `This recurrence would create more than ${MAX_OCCURRENCES} occurrences. Choose a shorter repeat-until date.`,
          "too_many_occurrences"
        );
      }
      dates.push(formatLocalDate(cursor));
    }

    cursor.setDate(cursor.getDate() + stepDays);
  }

  return dates;
}
