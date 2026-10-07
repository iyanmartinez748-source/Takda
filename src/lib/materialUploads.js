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

// Hybrid Lesson Materials #8B: tier-aware account-wide direct-upload
// limits — replaces the earlier temporary universal 25 MiB rail.
// Exact binary bytes, deliberately not a decimal-MB approximation, and
// deliberately identical to the literal bigints used by the #8A
// database trigger (10485760 / 52428800) so the two can never drift
// apart by rounding.
export const FREE_MATERIAL_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
export const PRO_MATERIAL_UPLOAD_LIMIT_BYTES = 50 * 1024 * 1024;

// Pure entitlement check — deliberately mirrors main.jsx's own
// getTakdaPlan() exactly: plan is lowercased before comparison, and
// pro_until must parse to a valid Date strictly greater than `now`.
// Case-sensitivity audit (required before this implementation): the
// #8A SQL trigger resolves entitlement via
// `lower(coalesce(plan,'free')) = 'pro' and pro_until is not null and
// pro_until > now()`. getTakdaPlan already does
// `String(profile?.plan || "free").toLowerCase()` before comparing, so
// it is ALREADY case-insensitive — no divergence exists between the
// client's existing entitlement rule and the DB trigger's rule, and
// this helper is written to match both. The only edge case considered
// was an empty-string plan value: JS's `|| "free"` substitutes "free"
// before comparing, while SQL's `coalesce` only replaces NULL (never
// an empty string) and instead falls through to `lower('') = 'pro'` —
// false. Both paths take a different route but land on the same
// practical outcome (Free), so this is not a real divergence.
// Never imports from React/main.jsx/Supabase — plan and proUntil must
// always be passed in explicitly by the caller.
export function isProfileEntitledToProUploadLimit(plan, proUntil, now = Date.now()) {
  const normalizedPlan = String(plan || "free").toLowerCase();
  const proUntilDate = proUntil ? new Date(proUntil) : null;

  const hasActiveProDate =
    proUntilDate instanceof Date &&
    !Number.isNaN(proUntilDate.getTime()) &&
    proUntilDate.getTime() > now;

  return normalizedPlan === "pro" && hasActiveProDate;
}

// Resolves the effective account-wide upload limit for a given
// profile's entitlement fields. Pure — never queries Supabase itself;
// the caller (storageAdapter.js) is responsible for fetching a FRESH
// profiles row and passing its raw plan/pro_until fields in here.
export function getMaterialUploadLimitBytes(plan, proUntil, now = Date.now()) {
  return isProfileEntitledToProUploadLimit(plan, proUntil, now)
    ? PRO_MATERIAL_UPLOAD_LIMIT_BYTES
    : FREE_MATERIAL_UPLOAD_LIMIT_BYTES;
}

// A SEPARATE failure category from MaterialUploadValidationError: that
// class is about whether a single file's own shape (name/size/MIME) is
// valid; this one is about whether uploading it would push the whole
// account over its (tier-dependent) account-wide storage limit — a
// check that depends on account state, not on anything intrinsic to
// the file itself. Keeping the two error types distinct lets a future
// UI give different messaging (e.g. "pick a different file" vs.
// "delete something or free up space") instead of conflating them
// under one code. Metadata is deliberately limited to plain numbers
// useful for that future messaging — never a user id, storage path,
// token, or any other sensitive/internal detail.
export class MaterialUploadQuotaError extends Error {
  constructor(message, { limitBytes, currentUsageBytes, newFileSize } = {}) {
    super(message);
    this.name = "MaterialUploadQuotaError";
    this.code = "quota_exceeded";
    this.limitBytes = limitBytes;
    this.currentUsageBytes = currentUsageBytes;
    this.newFileSize = newFileSize;
  }
}

// Pure threshold check: does currentUsageBytes + newFileSize exceed the
// caller-supplied limitBytes? Strictly greater-than, never >=, so a
// total that lands exactly ON the limit is still allowed. Overflow-safe
// by construction (mirrors the #8A SQL trigger's own branch shape):
// never computes currentUsageBytes + newFileSize directly. All three
// inputs are validated defensively — this helper never silently
// produces a misleading quota result from bad data (NaN/Infinity/
// negative usage, a non-positive file size, or a negative limit); it
// throws instead, since quota protection must never silently
// disappear because of unexpected input.
export function wouldExceedMaterialUploadQuota(currentUsageBytes, newFileSize, limitBytes) {
  if (!Number.isFinite(currentUsageBytes) || currentUsageBytes < 0) {
    throw new Error(
      "Takda: current upload usage must be a finite, non-negative number."
    );
  }

  if (!Number.isFinite(newFileSize) || newFileSize <= 0) {
    throw new Error(
      "Takda: new file size must be a finite, positive number."
    );
  }

  if (!Number.isFinite(limitBytes) || limitBytes < 0) {
    throw new Error(
      "Takda: upload limit must be a finite, non-negative number."
    );
  }

  if (currentUsageBytes >= limitBytes) {
    return newFileSize > 0;
  }

  return newFileSize > limitBytes - currentUsageBytes;
}
