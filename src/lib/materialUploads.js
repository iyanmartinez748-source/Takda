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

const BYTES_PER_MIB = 1024 * 1024;

// Rounds a byte count to a one-decimal MiB label, dropping the trailing
// ".0" for a whole number (e.g. 10485760 -> "10 MiB", not "10.0 MiB").
// Display-only formatting — never used by any quota decision.
function formatMiBLabel(bytes) {
  const rounded = Math.round((bytes / BYTES_PER_MIB) * 10) / 10;
  const fixed = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${fixed} MiB`;
}

// Hybrid Lesson Materials #9B: pure display-value helper for the
// account-wide Storage Usage Indicator. This is STRICTLY cosmetic —
// nothing in this function is ever consulted by wouldExceedMaterial
// UploadQuota, createSubjectMaterialUpload's preflight, or the #8A
// database trigger; it only turns an already-known (usage, limit) pair
// into numbers/labels safe to render. Deliberately requires limitBytes
// to be strictly positive (unlike wouldExceedMaterialUploadQuota, which
// tolerates a zero limit for its own reject-everything branch) because
// a zero/negative limit would make a percentage meaningless here
// (division by zero or a negative span) — there is no real product
// scenario where this helper would ever be called with one.
//
// currentUsageBytes may legitimately exceed limitBytes (a Pro account
// that downgraded to Free while already over 10 MiB) — this is NOT
// rejected; isOverLimit/percentRaw are exactly how that case is
// surfaced to the UI. percentClamped is the only value ever safe to
// use for a visual bar's width (never exceeds 100); percentRaw and
// isOverLimit exist specifically so the UI can still show the TRUE,
// unclamped usage in text, per product requirement.
export function getMaterialUploadUsageDisplay(currentUsageBytes, limitBytes) {
  if (!Number.isFinite(currentUsageBytes) || currentUsageBytes < 0) {
    throw new Error(
      "Takda: current upload usage must be a finite, non-negative number."
    );
  }

  if (!Number.isFinite(limitBytes) || limitBytes <= 0) {
    throw new Error(
      "Takda: upload limit must be a finite, positive number."
    );
  }

  const remainingBytes = Math.max(0, limitBytes - currentUsageBytes);
  const percentRaw = (currentUsageBytes / limitBytes) * 100;
  const percentClamped = Math.min(100, Math.max(0, Math.round(percentRaw)));
  const isOverLimit = currentUsageBytes > limitBytes;

  return {
    usedMiB: currentUsageBytes / BYTES_PER_MIB,
    limitMiB: limitBytes / BYTES_PER_MIB,
    remainingMiB: remainingBytes / BYTES_PER_MIB,
    usedMiBLabel: formatMiBLabel(currentUsageBytes),
    limitMiBLabel: formatMiBLabel(limitBytes),
    remainingMiBLabel: formatMiBLabel(remainingBytes),
    percentRaw,
    percentClamped,
    isOverLimit,
  };
}

// Parses a single subject_materials.file_size value (a Postgres bigint
// column) into a safe, non-negative, finite integer — or returns null
// for anything else (missing, malformed, negative, non-integer, NaN,
// Infinity, an unexpected type). Mirrors storageAdapter.js's own
// getAccountUploadUsageBytes parsing of this identical column — a
// bigint can come back from Supabase as either a JS number or a
// numeric string depending on client/value, and this helper accepts
// both — without duplicating or depending on that function (this
// module never imports storageAdapter.js). Returns null rather than
// silently substituting 0, so a caller can tell "zero bytes" apart
// from "could not determine this row's size" and react accordingly —
// callers must never treat a null result as 0.
export function parseMaterialUploadFileSize(rawValue) {
  if (typeof rawValue === "number") {
    // Number.isSafeInteger (not isFinite + isInteger): the latter pair
    // would accept a finite, fractionless-looking value like 2 ** 60,
    // which is already beyond exact double-precision representation.
    // Matches storageAdapter.js's own getAccountUploadUsageBytes number
    // branch for this identical file_size column, and the string
    // branch immediately below, which already used isSafeInteger.
    return Number.isSafeInteger(rawValue) && rawValue >= 0 ? rawValue : null;
  }

  if (typeof rawValue === "string" && /^\d+$/.test(rawValue)) {
    const converted = Number(rawValue);
    return Number.isSafeInteger(converted) && converted >= 0 ? converted : null;
  }

  return null;
}

// Hybrid Lesson Materials #9B: pure, account-wide usage aggregation for
// the Storage Usage Indicator — never consulted by any quota decision
// (the #8A database trigger and storageAdapter.js's own preflight each
// recompute usage independently, straight from the database). Takes
// the app's already-loaded, already-unfiltered `materials` array
// directly (zero network calls of its own) and skips every non-
// "upload" entry (material_type is used as the sole discriminator,
// exactly like storageAdapter.js's own usage query — external links
// are never inspected for a file size at all).
//
// Returns { usageBytes, isValid } rather than throwing or silently
// treating a malformed row as zero bytes: the moment ANY upload row's
// fileSize fails to parse cleanly via parseMaterialUploadFileSize,
// isValid becomes false and usageBytes is reset to 0 — a caller must
// treat usageBytes as meaningless unless isValid is true, and must
// never render it (or any derived percentage) in that case. This is
// what lets the UI fall back to a neutral "temporarily unavailable"
// message instead of ever displaying a corrupted or fabricated number.
export function computeAccountUploadUsageBytes(materials) {
  if (!Array.isArray(materials)) {
    return { usageBytes: 0, isValid: false };
  }

  let usageBytes = 0;

  for (const material of materials) {
    if (!material || material.materialType !== "upload") continue;

    const parsedSize = parseMaterialUploadFileSize(material.fileSize);

    if (parsedSize === null) {
      return { usageBytes: 0, isValid: false };
    }

    usageBytes += parsedSize;

    // Re-validated after every addition (not only once at the end):
    // each individual parsedSize is already a safe integer, but the
    // RUNNING TOTAL can still drift past Number.MAX_SAFE_INTEGER given
    // enough rows, at which point it would silently lose precision
    // rather than becoming NaN/Infinity — never throw or silently
    // accept that; fail closed exactly like a malformed per-row value.
    if (!Number.isSafeInteger(usageBytes)) {
      return { usageBytes: 0, isValid: false };
    }
  }

  return { usageBytes, isValid: true };
}

// Pure derivation of the two WAI-ARIA progressbar fields that must stay
// standards-compliant even once usage exceeds the limit (the explicit
// post-downgrade-overage product requirement): aria-valuenow must
// never exceed aria-valuemax, while aria-valuetext still carries the
// TRUE, unclamped usage plus an explicit "over your plan's limit"
// statement — so a screen-reader user is never told the over-limit
// state only through the visual bar's color. Reuses
// getMaterialUploadUsageDisplay rather than duplicating its validation
// or its isOverLimit/label logic.
export function getMaterialUploadUsageAccessibleValue(currentUsageBytes, limitBytes) {
  const display = getMaterialUploadUsageDisplay(currentUsageBytes, limitBytes);

  return {
    valueNow: Math.min(Math.round(currentUsageBytes), Math.round(limitBytes)),
    valueText: `${display.usedMiBLabel} of ${display.limitMiBLabel} used${
      display.isOverLimit ? ", over your plan's limit" : ""
    }`,
  };
}
