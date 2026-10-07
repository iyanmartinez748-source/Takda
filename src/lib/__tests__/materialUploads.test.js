// Hybrid Lesson Materials #5A: focused tests for the pure upload
// validation/derivation helpers (src/lib/materialUploads.js). Uses
// only Node's built-in test runner (node:test) and assert module,
// matching the existing convention already used by
// materialLinks.test.js — zero added dependencies, no network calls,
// no Supabase mocking, no real browser File object required (plain
// {name, size, type} objects are sufficient since the module only
// ever reads those three fields).
//
//   node --test src/lib/__tests__/materialUploads.test.js

import test from "node:test";
import assert from "node:assert/strict";

import {
  validateMaterialUploadFile,
  getMaterialUploadExtension,
  deriveMaterialUploadTitle,
  MaterialUploadValidationError,
  MAX_MATERIAL_UPLOAD_BYTES,
  FREE_MATERIAL_UPLOAD_LIMIT_BYTES,
  PRO_MATERIAL_UPLOAD_LIMIT_BYTES,
  isProfileEntitledToProUploadLimit,
  getMaterialUploadLimitBytes,
  MaterialUploadQuotaError,
  wouldExceedMaterialUploadQuota,
} from "../materialUploads.js";

const MIB = 1024 * 1024;

function fakeFile({ name = "document.pdf", size = 1024, type = "application/pdf" } = {}) {
  return { name, size, type };
}

function assertRejects(file, expectedCode) {
  assert.throws(
    () => validateMaterialUploadFile(file),
    (error) => error instanceof MaterialUploadValidationError && error.code === expectedCode
  );
}

// ---------------------------------------------------------
// VALID MIME
// ---------------------------------------------------------

test("validateMaterialUploadFile accepts application/pdf", () => {
  const file = fakeFile({ type: "application/pdf" });
  assert.deepEqual(validateMaterialUploadFile(file), {
    fileName: "document.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
  });
});

test("validateMaterialUploadFile accepts image/jpeg", () => {
  const file = fakeFile({ name: "photo.jpeg", type: "image/jpeg" });
  assert.equal(validateMaterialUploadFile(file).mimeType, "image/jpeg");
});

test("validateMaterialUploadFile accepts image/png", () => {
  const file = fakeFile({ name: "photo.png", type: "image/png" });
  assert.equal(validateMaterialUploadFile(file).mimeType, "image/png");
});

// ---------------------------------------------------------
// SIZE
// ---------------------------------------------------------

test("validateMaterialUploadFile accepts a 1-byte file", () => {
  const file = fakeFile({ size: 1 });
  assert.equal(validateMaterialUploadFile(file).fileSize, 1);
});

test("validateMaterialUploadFile accepts exactly MAX_MATERIAL_UPLOAD_BYTES", () => {
  const file = fakeFile({ size: MAX_MATERIAL_UPLOAD_BYTES });
  assert.equal(validateMaterialUploadFile(file).fileSize, MAX_MATERIAL_UPLOAD_BYTES);
  assert.equal(MAX_MATERIAL_UPLOAD_BYTES, 10485760);
});

test("validateMaterialUploadFile rejects one byte over the limit", () => {
  assertRejects(fakeFile({ size: MAX_MATERIAL_UPLOAD_BYTES + 1 }), "too_large");
});

test("validateMaterialUploadFile rejects a zero-byte file", () => {
  assertRejects(fakeFile({ size: 0 }), "non_positive_size");
});

test("validateMaterialUploadFile rejects a negative size", () => {
  assertRejects(fakeFile({ size: -1 }), "non_positive_size");
});

test("validateMaterialUploadFile rejects a non-finite size", () => {
  assertRejects(fakeFile({ size: NaN }), "invalid_size");
  assertRejects(fakeFile({ size: Infinity }), "invalid_size");
});

// ---------------------------------------------------------
// FILENAME
// ---------------------------------------------------------

test("validateMaterialUploadFile accepts a normal filename", () => {
  assert.equal(validateMaterialUploadFile(fakeFile({ name: "Reviewer.pdf" })).fileName, "Reviewer.pdf");
});

test("validateMaterialUploadFile rejects a whitespace-only filename", () => {
  assertRejects(fakeFile({ name: "   " }), "blank_filename");
});

test("validateMaterialUploadFile rejects a missing filename", () => {
  assertRejects(fakeFile({ name: "" }), "blank_filename");
});

test("validateMaterialUploadFile rejects a non-string filename", () => {
  assertRejects(fakeFile({ name: null }), "invalid_filename");
  assertRejects(fakeFile({ name: 123 }), "invalid_filename");
});

// ---------------------------------------------------------
// MIME
// ---------------------------------------------------------

test("validateMaterialUploadFile rejects an unsupported MIME type", () => {
  assertRejects(fakeFile({ type: "application/msword" }), "unsupported_mime");
});

test("validateMaterialUploadFile rejects an empty MIME value", () => {
  assertRejects(fakeFile({ type: "" }), "unsupported_mime");
});

test("validateMaterialUploadFile rejects a missing MIME value", () => {
  // Deliberately NOT built via fakeFile({ type: undefined }) — object
  // destructuring defaults also trigger on an explicit `undefined`
  // property value, so that call would silently fall back to
  // fakeFile's own default MIME ("application/pdf") instead of
  // testing a truly absent one. Constructing the object directly
  // avoids that trap.
  assertRejects({ name: "document.pdf", size: 1024, type: undefined }, "unsupported_mime");
});

test("validateMaterialUploadFile rejects a missing file object entirely", () => {
  assertRejects(null, "missing_file");
  assertRejects(undefined, "missing_file");
});

// ---------------------------------------------------------
// EXTENSION MAPPING
// ---------------------------------------------------------

test("getMaterialUploadExtension maps application/pdf to pdf", () => {
  assert.equal(getMaterialUploadExtension("application/pdf"), "pdf");
});

test("getMaterialUploadExtension maps image/jpeg to jpg", () => {
  assert.equal(getMaterialUploadExtension("image/jpeg"), "jpg");
});

test("getMaterialUploadExtension maps image/png to png", () => {
  assert.equal(getMaterialUploadExtension("image/png"), "png");
});

test("getMaterialUploadExtension fails for an unsupported MIME value", () => {
  assert.throws(
    () => getMaterialUploadExtension("application/msword"),
    (error) => error instanceof MaterialUploadValidationError && error.code === "unsupported_mime"
  );
});

// ---------------------------------------------------------
// TITLE DERIVATION
// ---------------------------------------------------------

test("deriveMaterialUploadTitle strips a simple extension", () => {
  assert.equal(deriveMaterialUploadTitle("Biology Chapter 1.pdf"), "Biology Chapter 1");
});

test("deriveMaterialUploadTitle strips .jpeg", () => {
  assert.equal(deriveMaterialUploadTitle("photo.jpeg"), "photo");
});

test("deriveMaterialUploadTitle strips .jpg", () => {
  assert.equal(deriveMaterialUploadTitle("photo.jpg"), "photo");
});

test("deriveMaterialUploadTitle strips only the LAST extension when the name contains multiple dots", () => {
  assert.equal(deriveMaterialUploadTitle("review.final.PDF"), "review.final");
});

test("deriveMaterialUploadTitle leaves an extensionless filename unchanged", () => {
  assert.equal(deriveMaterialUploadTitle("notes"), "notes");
});

test("deriveMaterialUploadTitle trims surrounding whitespace", () => {
  assert.equal(deriveMaterialUploadTitle("   Biology Chapter 1.pdf   "), "Biology Chapter 1");
});

test("deriveMaterialUploadTitle falls back to the trimmed filename rather than producing an empty title", () => {
  // A leading dot with nothing before it (e.g. a dotfile-style name)
  // would strip to "" if naively sliced — must fall back instead.
  assert.equal(deriveMaterialUploadTitle(".pdf"), ".pdf");
  assert.equal(deriveMaterialUploadTitle("   .pdf   "), ".pdf");
});

// ---------------------------------------------------------
// FILENAME/MIME MISMATCH
// ---------------------------------------------------------

test("validateMaterialUploadFile accepts a filename/MIME mismatch when the MIME itself is allowed", () => {
  // "fake.pdf" selected with type "image/jpeg" — file.type is simply
  // the browser-provided MIME value, not proof of the file's actual
  // content. This module never reads file bytes and makes no claim
  // about what the file truly is; it only validates the MIME value
  // against the allow-list.
  const file = fakeFile({ name: "fake.pdf", type: "image/jpeg" });
  const result = validateMaterialUploadFile(file);
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.fileName, "fake.pdf");
});

test("getMaterialUploadExtension returns the canonical extension for the validated MIME, not the filename's extension", () => {
  // Continuing the fake.pdf/image-jpeg example: the Storage extension
  // is derived from the validated MIME value ("image/jpeg" -> "jpg"),
  // never from the filename's own ".pdf" suffix. This does not assert
  // or imply the underlying bytes are genuinely a JPEG image.
  assert.equal(getMaterialUploadExtension("image/jpeg"), "jpg");
});

// ---------------------------------------------------------
// FREE/PRO ACCOUNT-WIDE UPLOAD LIMITS (#8B)
// ---------------------------------------------------------

test("FREE_MATERIAL_UPLOAD_LIMIT_BYTES is exactly 10 MiB in binary bytes", () => {
  assert.equal(FREE_MATERIAL_UPLOAD_LIMIT_BYTES, 10485760);
  assert.equal(FREE_MATERIAL_UPLOAD_LIMIT_BYTES, 10 * MIB);
});

test("PRO_MATERIAL_UPLOAD_LIMIT_BYTES is exactly 50 MiB in binary bytes", () => {
  assert.equal(PRO_MATERIAL_UPLOAD_LIMIT_BYTES, 52428800);
  assert.equal(PRO_MATERIAL_UPLOAD_LIMIT_BYTES, 50 * MIB);
});

// ---------------------------------------------------------
// isProfileEntitledToProUploadLimit (mirrors main.jsx getTakdaPlan)
// ---------------------------------------------------------

test("isProfileEntitledToProUploadLimit is true for an active pro plan", () => {
  const now = Date.now();
  assert.equal(
    isProfileEntitledToProUploadLimit("pro", new Date(now + 1000).toISOString(), now),
    true
  );
});

test("isProfileEntitledToProUploadLimit is case-insensitive on plan", () => {
  const now = Date.now();
  const future = new Date(now + 1000).toISOString();
  assert.equal(isProfileEntitledToProUploadLimit("PRO", future, now), true);
  assert.equal(isProfileEntitledToProUploadLimit("Pro", future, now), true);
});

test("isProfileEntitledToProUploadLimit is false for a missing plan (defaults to free)", () => {
  const now = Date.now();
  const future = new Date(now + 1000).toISOString();
  assert.equal(isProfileEntitledToProUploadLimit(null, future, now), false);
  assert.equal(isProfileEntitledToProUploadLimit(undefined, future, now), false);
  assert.equal(isProfileEntitledToProUploadLimit("", future, now), false);
});

test("isProfileEntitledToProUploadLimit is false for an explicit free plan", () => {
  const now = Date.now();
  const future = new Date(now + 1000).toISOString();
  assert.equal(isProfileEntitledToProUploadLimit("free", future, now), false);
});

test("isProfileEntitledToProUploadLimit is false when pro_until is missing", () => {
  assert.equal(isProfileEntitledToProUploadLimit("pro", null), false);
  assert.equal(isProfileEntitledToProUploadLimit("pro", undefined), false);
});

test("isProfileEntitledToProUploadLimit is false when pro_until is exactly now (not strictly future)", () => {
  const now = Date.now();
  assert.equal(isProfileEntitledToProUploadLimit("pro", new Date(now).toISOString(), now), false);
});

test("isProfileEntitledToProUploadLimit is false when pro_until is in the past", () => {
  const now = Date.now();
  assert.equal(
    isProfileEntitledToProUploadLimit("pro", new Date(now - 1000).toISOString(), now),
    false
  );
});

test("isProfileEntitledToProUploadLimit is false when pro_until does not parse to a valid date", () => {
  const now = Date.now();
  assert.equal(isProfileEntitledToProUploadLimit("pro", "not-a-date", now), false);
});

test("isProfileEntitledToProUploadLimit defaults `now` to Date.now() when omitted", () => {
  const future = new Date(Date.now() + 60000).toISOString();
  assert.equal(isProfileEntitledToProUploadLimit("pro", future), true);
});

// ---------------------------------------------------------
// getMaterialUploadLimitBytes
// ---------------------------------------------------------

test("getMaterialUploadLimitBytes returns the Pro limit for an active pro profile", () => {
  const now = Date.now();
  const future = new Date(now + 1000).toISOString();
  assert.equal(getMaterialUploadLimitBytes("pro", future, now), PRO_MATERIAL_UPLOAD_LIMIT_BYTES);
});

test("getMaterialUploadLimitBytes returns the Free limit for a free/expired/missing profile", () => {
  const now = Date.now();
  assert.equal(getMaterialUploadLimitBytes("free", null, now), FREE_MATERIAL_UPLOAD_LIMIT_BYTES);
  assert.equal(getMaterialUploadLimitBytes(null, null, now), FREE_MATERIAL_UPLOAD_LIMIT_BYTES);
  assert.equal(
    getMaterialUploadLimitBytes("pro", new Date(now - 1000).toISOString(), now),
    FREE_MATERIAL_UPLOAD_LIMIT_BYTES
  );
});

// ---------------------------------------------------------
// wouldExceedMaterialUploadQuota (generalized, tier-aware)
// ---------------------------------------------------------

test("wouldExceedMaterialUploadQuota allows 0 usage + 1 byte under the Free limit", () => {
  assert.equal(wouldExceedMaterialUploadQuota(0, 1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES), false);
});

test("wouldExceedMaterialUploadQuota allows a total landing exactly on the Free limit", () => {
  assert.equal(
    wouldExceedMaterialUploadQuota(5 * MIB, 5 * MIB, FREE_MATERIAL_UPLOAD_LIMIT_BYTES),
    false
  );
});

test("wouldExceedMaterialUploadQuota rejects one byte over the Free limit", () => {
  assert.equal(
    wouldExceedMaterialUploadQuota(5 * MIB, 5 * MIB + 1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES),
    true
  );
});

test("wouldExceedMaterialUploadQuota rejects usage already at the Free limit plus one more byte", () => {
  assert.equal(
    wouldExceedMaterialUploadQuota(FREE_MATERIAL_UPLOAD_LIMIT_BYTES, 1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES),
    true
  );
});

test("wouldExceedMaterialUploadQuota allows a total landing exactly on the Pro limit", () => {
  assert.equal(
    wouldExceedMaterialUploadQuota(40 * MIB, 10 * MIB, PRO_MATERIAL_UPLOAD_LIMIT_BYTES),
    false
  );
});

test("wouldExceedMaterialUploadQuota rejects one byte over the Pro limit", () => {
  assert.equal(
    wouldExceedMaterialUploadQuota(40 * MIB, 10 * MIB + 1, PRO_MATERIAL_UPLOAD_LIMIT_BYTES),
    true
  );
});

test("wouldExceedMaterialUploadQuota rejects usage already at the Pro limit plus one more byte", () => {
  assert.equal(
    wouldExceedMaterialUploadQuota(PRO_MATERIAL_UPLOAD_LIMIT_BYTES, 1, PRO_MATERIAL_UPLOAD_LIMIT_BYTES),
    true
  );
});

test("wouldExceedMaterialUploadQuota rejects a Free-limit upload a Pro-sized file would have fit", () => {
  // Confirms the limit is genuinely parameterized, not hardcoded: the
  // same (usage, file size) pair must behave differently depending on
  // which limit is passed in.
  assert.equal(
    wouldExceedMaterialUploadQuota(8 * MIB, 5 * MIB, FREE_MATERIAL_UPLOAD_LIMIT_BYTES),
    true
  );
  assert.equal(
    wouldExceedMaterialUploadQuota(8 * MIB, 5 * MIB, PRO_MATERIAL_UPLOAD_LIMIT_BYTES),
    false
  );
});

// External link materials never call this upload quota helper; link
// exclusion is enforced by the upload-only data-layer path
// (storageAdapter.js), not by anything in this pure module — this
// module has no concept of material_type at all, so there is no
// meaningful assertion to make about it here.

test("wouldExceedMaterialUploadQuota rejects invalid current usage values", () => {
  assert.throws(() => wouldExceedMaterialUploadQuota(NaN, 1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(Infinity, 1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(-1, 1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota("20", 1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(null, 1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(undefined, 1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
});

test("wouldExceedMaterialUploadQuota rejects invalid new file size values", () => {
  assert.throws(() => wouldExceedMaterialUploadQuota(0, NaN, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, Infinity, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, 0, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, -1, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, "10", FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, null, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, undefined, FREE_MATERIAL_UPLOAD_LIMIT_BYTES));
});

test("wouldExceedMaterialUploadQuota rejects invalid limit values", () => {
  assert.throws(() => wouldExceedMaterialUploadQuota(0, 1, NaN));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, 1, Infinity));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, 1, -1));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, 1, "10"));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, 1, null));
  assert.throws(() => wouldExceedMaterialUploadQuota(0, 1, undefined));
});

test("MaterialUploadQuotaError carries name, code, and metadata", () => {
  const error = new MaterialUploadQuotaError("Takda: over quota.", {
    limitBytes: FREE_MATERIAL_UPLOAD_LIMIT_BYTES,
    currentUsageBytes: 8 * MIB,
    newFileSize: 5 * MIB,
  });

  assert.equal(error.name, "MaterialUploadQuotaError");
  assert.equal(error.code, "quota_exceeded");
  assert.equal(error.limitBytes, FREE_MATERIAL_UPLOAD_LIMIT_BYTES);
  assert.equal(error.currentUsageBytes, 8 * MIB);
  assert.equal(error.newFileSize, 5 * MIB);
  assert.ok(error instanceof Error);
});

test("MaterialUploadQuotaError works with no metadata supplied", () => {
  const error = new MaterialUploadQuotaError("Takda: over quota.");
  assert.equal(error.name, "MaterialUploadQuotaError");
  assert.equal(error.code, "quota_exceeded");
  assert.equal(error.limitBytes, undefined);
});
