// Phase 9E timezone-capture mini-stage: pure, dependency-free helpers for
// detecting and validating the browser's IANA timezone, so an authenticated
// user's profiles.timezone (Stage 9E-4A) can be filled in automatically
// when it is missing/invalid — without ever guessing a value.
//
// No React, no Supabase client, no network calls, no storage — same "pure
// module" discipline src/lib/reminderEngine.js already follows, so these
// functions are trivially unit-testable and never risk breaking app
// load/login regardless of what the browser's Intl implementation does.

// The standard, dependency-free way to validate an IANA zone name — the
// same technique reminderEngine.js's own isValidIanaTimeZone uses: an
// invalid zone name throws inside Intl.DateTimeFormat's constructor.
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

// Reads the browser's own resolved timezone. Returns null — never throws,
// never guesses, never falls back to any fixed zone — whenever the
// runtime fails to report one or reports something that isn't a real IANA
// zone. Callers must treat null as "do nothing."
export function detectBrowserTimeZone() {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidIanaTimeZone(detected) ? detected : null;
  } catch {
    return null;
  }
}

// Decides whether a freshly detected timezone should be written to
// profiles.timezone. Only true when:
//   - the detected value is itself a real, valid IANA zone, AND
//   - the currently stored value is missing (null/empty) or invalid.
//
// An already-valid stored timezone is never considered replaceable here —
// a user traveling temporarily keeps their saved/home timezone instead of
// having it silently overwritten by whatever zone their device currently
// reports. Changing an already-valid saved timezone is a deliberate,
// separate, user-facing action, not an automatic side effect of loading
// the app.
export function shouldStoreDetectedTimeZone(currentTimeZone, detectedTimeZone) {
  if (!isValidIanaTimeZone(detectedTimeZone)) return false;
  return !isValidIanaTimeZone(currentTimeZone);
}
