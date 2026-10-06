// Hybrid Lesson Materials #5A: pure file-upload validation/derivation
// helpers. Zero Supabase/React dependency, zero network/Storage calls,
// no side effects — mirrors the same self-contained shape as
// src/lib/materialLinks.js, specifically so this stays unit-testable
// without mocking Supabase. Never reads file bytes (no FileReader, no
// arrayBuffer(), no magic-byte inspection) — this module only looks at
// the three plain fields a File/file-like object already exposes:
// name, size, type.
//
// IMPORTANT: `file.type` is simply the MIME value the browser makes
// available for the selected file (derived from the file's extension/
// OS association at selection time) — NOT a guarantee, proof, or
// content-sniffed confirmation of what the bytes actually are. This
// module validates and trusts that browser-provided value as the
// canonical type for choosing a Storage extension; it does not and
// cannot prove the file's true content. A filename/MIME mismatch
// (e.g. "fake.pdf" selected with type "image/jpeg") is accepted here
// if the MIME value itself passes validation — the filename is never
// used to choose the Storage extension, and is never an authorization
// boundary.

export const MAX_MATERIAL_UPLOAD_BYTES = 10485760; // 10 MiB

export const ALLOWED_MATERIAL_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const MIME_TO_EXTENSION = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export class MaterialUploadValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "MaterialUploadValidationError";
    this.code = code;
  }
}

// Validates a File/file-like object for a lesson-material upload.
// Throws MaterialUploadValidationError (never returns a failure value)
// so a future UI stage can switch on `.code` the same way App.jsx
// already does for RecurrenceValidationError and will for
// MaterialLinkValidationError. Returns a plain, independent descriptor
// of the validated fields on success — never mutates the passed-in
// file object.
export function validateMaterialUploadFile(file) {
  if (!file) {
    throw new MaterialUploadValidationError(
      "Takda: a file is required to upload a lesson material.",
      "missing_file"
    );
  }

  if (typeof file.name !== "string") {
    throw new MaterialUploadValidationError(
      "Takda: that file has no readable name.",
      "invalid_filename"
    );
  }

  const trimmedName = file.name.trim();

  if (!trimmedName) {
    throw new MaterialUploadValidationError(
      "Takda: that file has no readable name.",
      "blank_filename"
    );
  }

  if (!Number.isFinite(file.size)) {
    throw new MaterialUploadValidationError(
      "Takda: that file's size could not be determined.",
      "invalid_size"
    );
  }

  if (file.size <= 0) {
    throw new MaterialUploadValidationError(
      "Takda: that file appears to be empty.",
      "non_positive_size"
    );
  }

  if (file.size > MAX_MATERIAL_UPLOAD_BYTES) {
    throw new MaterialUploadValidationError(
      "Takda: lesson material uploads must be 10 MB or smaller.",
      "too_large"
    );
  }

  if (!ALLOWED_MATERIAL_UPLOAD_MIME_TYPES.includes(file.type)) {
    throw new MaterialUploadValidationError(
      "Takda: only PDF, JPEG, and PNG files can be uploaded.",
      "unsupported_mime"
    );
  }

  return {
    fileName: trimmedName,
    fileSize: file.size,
    mimeType: file.type,
  };
}

// Maps a validated MIME value to the canonical extension used for the
// future Storage object path ({user_id}/{subject_id}/{uuid}.{ext}).
// Deliberately keyed off the MIME value, never off the original
// filename — the filename is stored only as display metadata
// (subject_materials.file_name), never used to choose this extension.
export function getMaterialUploadExtension(mimeType) {
  const extension = MIME_TO_EXTENSION[mimeType];

  if (!extension) {
    throw new MaterialUploadValidationError(
      "Takda: only PDF, JPEG, and PNG files can be uploaded.",
      "unsupported_mime"
    );
  }

  return extension;
}

// Derives a user-editable default title from an original filename by
// stripping its last extension — a pure suggestion only. The actual
// upload flow must still independently require a nonblank final title
// after the user has had a chance to edit this default.
export function deriveMaterialUploadTitle(fileName) {
  const trimmed = (fileName || "").trim();
  const lastDotIndex = trimmed.lastIndexOf(".");

  // No extension at all, or the only dot is the filename's first
  // character (e.g. ".pdf" with nothing before it) — stripping would
  // either do nothing or produce an empty title, so fall back to the
  // trimmed filename as-is rather than ever returning "".
  if (lastDotIndex <= 0) {
    return trimmed;
  }

  const withoutExtension = trimmed.slice(0, lastDotIndex).trim();
  return withoutExtension || trimmed;
}
