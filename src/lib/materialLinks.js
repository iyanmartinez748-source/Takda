// Hybrid Lesson Materials #2: pure external-link validation/
// normalization. Zero Supabase/React dependency — this module only
// decides whether a user-supplied string is a safe, storable HTTPS
// link, and returns the normalized string to store. It never fetches
// the URL, resolves redirects, contacts the external provider, or
// whitelists domains (students use Google Drive, OneDrive, Dropbox,
// school LMS domains, and other arbitrary legitimate educational
// hosts). Opening the link is a later UI stage's concern, not this
// module's.

const MAX_EXTERNAL_URL_LENGTH = 2048;

export class MaterialLinkValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "MaterialLinkValidationError";
    this.code = code;
  }
}

// Validates and normalizes a user-supplied external link. Throws
// MaterialLinkValidationError (never returns a failure value) so a
// future UI stage can switch on `.code` the same way App.jsx already
// does for RecurrenceValidationError. Returns the normalized URL
// string (via the parsed URL's own .toString()) on success.
export function normalizeExternalUrl(rawUrl) {
  if (typeof rawUrl !== "string") {
    throw new MaterialLinkValidationError(
      "Takda: a material link must be a text URL.",
      "not_a_string"
    );
  }

  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw new MaterialLinkValidationError(
      "Takda: a material link is required.",
      "empty"
    );
  }

  if (trimmed.length > MAX_EXTERNAL_URL_LENGTH) {
    throw new MaterialLinkValidationError(
      `Takda: a material link must be ${MAX_EXTERNAL_URL_LENGTH} characters or fewer.`,
      "too_long"
    );
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new MaterialLinkValidationError(
      "Takda: that link doesn't look like a valid URL.",
      "malformed"
    );
  }

  // Exactly "https:" — never auto-upgrade http:// to https://, and
  // never accept javascript:/data:/file:/ftp:/mailto:/anything else.
  if (parsed.protocol !== "https:") {
    throw new MaterialLinkValidationError(
      "Takda: material links must start with https://.",
      "invalid_protocol"
    );
  }

  if (!parsed.hostname) {
    throw new MaterialLinkValidationError(
      "Takda: that link is missing a valid domain.",
      "missing_hostname"
    );
  }

  if (parsed.username || parsed.password) {
    throw new MaterialLinkValidationError(
      "Takda: material links cannot include a username or password.",
      "credentials_not_allowed"
    );
  }

  return parsed.toString();
}
