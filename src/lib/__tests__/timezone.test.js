// Phase 9E timezone-capture mini-stage: focused tests for
// src/lib/timezone.js.
//
// Uses only Node's built-in test runner (node:test) and assert module —
// zero added dependencies, matching the same convention already used by
// src/lib/__tests__/reminderEngine.test.js. Run with:
//
//   node --test src/lib/__tests__/timezone.test.js

import test from "node:test";
import assert from "node:assert/strict";

import {
  isValidIanaTimeZone,
  detectBrowserTimeZone,
  shouldStoreDetectedTimeZone,
} from "../timezone.js";

test("isValidIanaTimeZone accepts real IANA zone names", () => {
  assert.equal(isValidIanaTimeZone("Asia/Manila"), true);
  assert.equal(isValidIanaTimeZone("UTC"), true);
  assert.equal(isValidIanaTimeZone("America/New_York"), true);
});

test("isValidIanaTimeZone rejects invalid/missing/empty values", () => {
  assert.equal(isValidIanaTimeZone("Not/AZone"), false);
  assert.equal(isValidIanaTimeZone(""), false);
  assert.equal(isValidIanaTimeZone("   "), false);
  assert.equal(isValidIanaTimeZone(null), false);
  assert.equal(isValidIanaTimeZone(undefined), false);
  assert.equal(isValidIanaTimeZone(123), false);
});

test("detectBrowserTimeZone returns a real, valid IANA zone under normal conditions", () => {
  const detected = detectBrowserTimeZone();

  assert.equal(typeof detected, "string");
  assert.equal(isValidIanaTimeZone(detected), true);
});

test("detectBrowserTimeZone safely returns null (never throws, never guesses) when detection fails", () => {
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  // Simulate a runtime whose Intl implementation cannot resolve a
  // timezone at all — detectBrowserTimeZone must not throw out of this
  // and must not fall back to any fixed zone.
  Intl.DateTimeFormat = function () {
    throw new Error("simulated Intl failure");
  };

  try {
    const result = detectBrowserTimeZone();
    assert.equal(result, null);
  } finally {
    Intl.DateTimeFormat = OriginalDateTimeFormat;
  }
});

test("detectBrowserTimeZone safely returns null when the resolved timezone is not a valid IANA zone", () => {
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  // Only the no-arg "detect" call is faked to resolve to a garbage zone
  // name; a call that passes a timeZone option (isValidIanaTimeZone's own
  // validation call) is delegated to the real constructor, so this test
  // exercises detectBrowserTimeZone's real safety net rather than a mock
  // that would trivially "validate" anything.
  Intl.DateTimeFormat = function (locale, options) {
    if (options && options.timeZone) {
      return new OriginalDateTimeFormat(locale, options);
    }
    return { resolvedOptions: () => ({ timeZone: "Not/AZone" }) };
  };

  try {
    const result = detectBrowserTimeZone();
    assert.equal(result, null);
  } finally {
    Intl.DateTimeFormat = OriginalDateTimeFormat;
  }
});

test("shouldStoreDetectedTimeZone: NULL saved timezone is eligible for a valid detected timezone", () => {
  assert.equal(shouldStoreDetectedTimeZone(null, "Asia/Manila"), true);
});

test("shouldStoreDetectedTimeZone: empty-string saved timezone is eligible for a valid detected timezone", () => {
  assert.equal(shouldStoreDetectedTimeZone("", "Asia/Manila"), true);
});

test("shouldStoreDetectedTimeZone: invalid saved timezone is eligible for a valid detected timezone", () => {
  assert.equal(shouldStoreDetectedTimeZone("Not/AZone", "Asia/Manila"), true);
});

test("shouldStoreDetectedTimeZone: an already-valid saved timezone is never considered replaceable", () => {
  // Even a DIFFERENT valid zone (e.g. a user currently traveling) must not
  // be treated as eligible to overwrite an existing valid saved zone.
  assert.equal(shouldStoreDetectedTimeZone("Asia/Manila", "America/New_York"), false);
  assert.equal(shouldStoreDetectedTimeZone("Asia/Manila", "Asia/Manila"), false);
});

test("shouldStoreDetectedTimeZone: never stores when the detected value itself is invalid, regardless of saved state", () => {
  assert.equal(shouldStoreDetectedTimeZone(null, null), false);
  assert.equal(shouldStoreDetectedTimeZone(null, "Not/AZone"), false);
  assert.equal(shouldStoreDetectedTimeZone("Asia/Manila", null), false);
  assert.equal(shouldStoreDetectedTimeZone("Not/AZone", "Not/AZone"), false);
});
