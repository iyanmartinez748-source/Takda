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
} from "../materialUploads.js";

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
