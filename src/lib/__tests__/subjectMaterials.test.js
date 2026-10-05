// Hybrid Lesson Materials #2: focused tests for the pure
// toSubjectMaterial DB-row -> app-shape mapper (src/lib/
// subjectMaterials.js). This module has zero Supabase/React
// dependency and zero imports of its own, so this test never resolves
// storageAdapter.js or its "./supabase" import — consistent with the
// existing convention that only self-contained pure modules
// (recurrence.js, timezone.js, planningEngine.js, reminderEngine.js)
// get a dedicated test file; storageAdapter.js itself still has none,
// since every other function there requires a real/mocked Supabase
// session to exercise, which this stage deliberately does not add.
//
//   node --test src/lib/__tests__/subjectMaterials.test.js

import test from "node:test";
import assert from "node:assert/strict";

import { toSubjectMaterial } from "../subjectMaterials.js";

test("toSubjectMaterial maps a link row to the app shape", () => {
  const row = {
    id: "mat-1",
    user_id: "user-1",
    subject_id: "subj-1",
    material_type: "link",
    title: "Lesson 2 — Muscular System",
    description: "Slides from class",
    storage_path: null,
    file_name: null,
    mime_type: null,
    file_size: null,
    external_url: "https://drive.google.com/file/d/abc/view",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: null,
  };

  assert.deepEqual(toSubjectMaterial(row), {
    id: "mat-1",
    subjectId: "subj-1",
    materialType: "link",
    title: "Lesson 2 — Muscular System",
    description: "Slides from class",
    storagePath: null,
    fileName: null,
    mimeType: null,
    fileSize: null,
    externalUrl: "https://drive.google.com/file/d/abc/view",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: null,
  });
});

test("toSubjectMaterial maps an upload row to the app shape (not yet writable, but already loadable)", () => {
  const row = {
    id: "mat-2",
    user_id: "user-1",
    subject_id: "subj-1",
    material_type: "upload",
    title: "Lesson 1 — Human Skeletal System",
    description: null,
    storage_path: "user-1/subj-1/uuid-skeletal.pdf",
    file_name: "Human Skeletal System.pdf",
    mime_type: "application/pdf",
    file_size: 204800,
    external_url: null,
    created_at: "2026-09-02T00:00:00.000Z",
    updated_at: "2026-09-03T00:00:00.000Z",
  };

  assert.deepEqual(toSubjectMaterial(row), {
    id: "mat-2",
    subjectId: "subj-1",
    materialType: "upload",
    title: "Lesson 1 — Human Skeletal System",
    description: null,
    storagePath: "user-1/subj-1/uuid-skeletal.pdf",
    fileName: "Human Skeletal System.pdf",
    mimeType: "application/pdf",
    fileSize: 204800,
    externalUrl: null,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  });
});

test("toSubjectMaterial normalizes a missing description to null", () => {
  const row = {
    id: "mat-3",
    subject_id: "subj-1",
    material_type: "link",
    title: "Reviewer",
    description: null,
    storage_path: null,
    file_name: null,
    mime_type: null,
    file_size: null,
    external_url: "https://example.com/reviewer.pdf",
    created_at: "2026-09-04T00:00:00.000Z",
    updated_at: null,
  };

  assert.equal(toSubjectMaterial(row).description, null);
});

test("toSubjectMaterial preserves a zero-length-safe file_size and does not coerce 0 away", () => {
  // file_size is DB-constrained to be either null or > 0, but the
  // mapper itself should not assume that — it should pass through
  // whatever numeric value is present rather than treating falsy
  // (e.g. 0) as missing, which is why it uses `??` and not `||`.
  const row = {
    id: "mat-4",
    subject_id: "subj-1",
    material_type: "upload",
    title: "Edge case",
    description: null,
    storage_path: "path",
    file_name: "file.png",
    mime_type: "image/png",
    file_size: 0,
    external_url: null,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: null,
  };

  assert.equal(toSubjectMaterial(row).fileSize, 0);
});
