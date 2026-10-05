// Hybrid Lesson Materials #2: pure DB-row -> app-shape mapper for
// public.subject_materials. Zero Supabase/React dependency and zero
// imports of its own — mirrors the same self-contained shape as
// src/lib/recurrence.js and src/lib/timezone.js, specifically so it
// stays unit-testable without ever resolving storageAdapter.js's own
// "./supabase" import. Maps both material_type values identically;
// the data layer currently only ever writes 'link' rows, but loading
// already maps 'upload' rows correctly so a later stage's loader needs
// no rewrite.
export function toSubjectMaterial(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    materialType: row.material_type,
    title: row.title,
    description: row.description || null,
    storagePath: row.storage_path || null,
    fileName: row.file_name || null,
    mimeType: row.mime_type || null,
    fileSize: row.file_size ?? null,
    externalUrl: row.external_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}
