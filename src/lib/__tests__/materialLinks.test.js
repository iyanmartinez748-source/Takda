// Hybrid Lesson Materials #2: focused tests for the pure external-link
// validator (src/lib/materialLinks.js). Uses only Node's built-in test
// runner (node:test) and assert module, matching the existing
// convention already used by timezone.test.js/recurrence tests — zero
// added dependencies, no network calls, no Supabase mocking.
//
//   node --test src/lib/__tests__/materialLinks.test.js

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeExternalUrl,
  MaterialLinkValidationError,
} from "../materialLinks.js";

function assertRejects(input, expectedCode) {
  assert.throws(
    () => normalizeExternalUrl(input),
    (error) => error instanceof MaterialLinkValidationError && error.code === expectedCode
  );
}

test("normalizeExternalUrl accepts a normal https URL", () => {
  assert.equal(
    normalizeExternalUrl("https://example.com/reviewer.pdf"),
    "https://example.com/reviewer.pdf"
  );
});

test("normalizeExternalUrl accepts a Google Drive-style https URL", () => {
  const url = "https://drive.google.com/file/d/abc123XYZ/view?usp=sharing";
  assert.equal(normalizeExternalUrl(url), url);
});

test("normalizeExternalUrl accepts a school/custom-domain https URL", () => {
  const url = "https://lms.myschool.edu.ph/courses/101/materials/lesson1";
  assert.equal(normalizeExternalUrl(url), url);
});

test("normalizeExternalUrl accepts a URL with query parameters", () => {
  const url = "https://example.com/doc?id=5&mode=view";
  assert.equal(normalizeExternalUrl(url), url);
});

test("normalizeExternalUrl accepts a URL with a fragment", () => {
  const url = "https://example.com/doc#page=3";
  assert.equal(normalizeExternalUrl(url), url);
});

test("normalizeExternalUrl trims leading/trailing whitespace", () => {
  assert.equal(
    normalizeExternalUrl("   https://example.com/notes.pdf   "),
    "https://example.com/notes.pdf"
  );
});

test("normalizeExternalUrl rejects an empty string", () => {
  assertRejects("", "empty");
});

test("normalizeExternalUrl rejects a whitespace-only string", () => {
  assertRejects("   ", "empty");
});

test("normalizeExternalUrl rejects non-string input", () => {
  assertRejects(null, "not_a_string");
  assertRejects(undefined, "not_a_string");
  assertRejects(12345, "not_a_string");
  assertRejects({ href: "https://example.com" }, "not_a_string");
});

test("normalizeExternalUrl rejects a malformed URL", () => {
  assertRejects("not a url at all", "malformed");
  assertRejects("https://", "malformed");
});

test("normalizeExternalUrl rejects plain http://", () => {
  assertRejects("http://example.com/file.pdf", "invalid_protocol");
});

test("normalizeExternalUrl rejects javascript:", () => {
  assertRejects("javascript:alert(1)", "invalid_protocol");
});

test("normalizeExternalUrl rejects data:", () => {
  assertRejects("data:text/plain,hello", "invalid_protocol");
});

test("normalizeExternalUrl rejects file:", () => {
  assertRejects("file:///etc/passwd", "invalid_protocol");
});

test("normalizeExternalUrl rejects ftp:", () => {
  assertRejects("ftp://example.com/file.pdf", "invalid_protocol");
});

test("normalizeExternalUrl rejects mailto:", () => {
  assertRejects("mailto:someone@example.com", "invalid_protocol");
});

test("normalizeExternalUrl rejects a URL with an embedded username", () => {
  assertRejects("https://student@example.com/file.pdf", "credentials_not_allowed");
});

test("normalizeExternalUrl rejects a URL with an embedded username and password", () => {
  assertRejects("https://student:secret@example.com/file.pdf", "credentials_not_allowed");
});

test("normalizeExternalUrl rejects a URL over 2048 characters after trimming", () => {
  const longPath = "a".repeat(2100);
  assertRejects(`https://example.com/${longPath}`, "too_long");
});

test("normalizeExternalUrl does not reject a URL just under the length limit", () => {
  // "https://example.com/" is 21 chars; pad to land under 2048 total.
  const path = "a".repeat(2000);
  const url = `https://example.com/${path}`;
  assert.equal(normalizeExternalUrl(url), url);
});
