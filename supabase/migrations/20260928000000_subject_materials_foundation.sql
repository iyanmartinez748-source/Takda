-- =========================================================
-- Hybrid Lesson Materials #1: subject_materials database foundation
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED.
--
-- Purpose: add a new, purely additive public.subject_materials table so
-- a subject can eventually have "Lesson Materials" attached to it — two
-- material types supported from day one (an uploaded file, or an
-- external HTTPS link), even though neither's application code
-- (Storage bucket, upload UI, link UI) exists yet. This migration is
-- schema only.
--
-- This migration is additive/behavioral only:
--   - does NOT modify subjects/activities/notes/grades/semesters/
--     subject_schedules or any existing column, FK, RLS, or data
--   - does NOT add semester_id anywhere on subject_materials — exactly
--     like subject_schedules, a material's semester context is always
--     inherited transitively through its parent subject
--     (subject_materials.subject_id -> subjects.semester_id), never
--     stored redundantly here
--   - does NOT create a Supabase Storage bucket, Storage policy, or
--     touch the existing "avatars" bucket in any way — private Storage
--     for uploaded files is a later stage
--   - does NOT backfill or generate any subject_materials rows — every
--     existing subject has zero materials until a student explicitly
--     adds one in a later stage
--   - does NOT modify profiles, pro_orders, or any PayMongo-related
--     table, and does NOT touch reminder/push tables
-- =========================================================

-- ---------------------------------------------------------
-- Ownership FK evidence: public.subjects already carries a
-- UNIQUE (user_id, id) constraint — added by the tracked
-- supabase/migrations/20260922000000_subject_schedules.sql migration
-- ("subjects_user_id_id_unique"), whose own comment proves this is
-- guaranteed-safe because subjects.id is already the primary key.
-- subject_schedules already depends on that exact constraint for its
-- own composite ownership FK, so this migration reuses the same proven
-- constraint rather than re-adding it or modifying subjects in any way.
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- subject_materials: one row = one lesson material attached to a
-- subject, either an uploaded file or an external link.
--
-- material_type uses a CHECK constraint rather than a Postgres enum —
-- lower-risk and easier to extend with a future third type (e.g. a
-- provider-specific integration) than an enum, which Postgres cannot
-- easily shrink/alter once in use.
--
-- The upload_or_link CHECK below is the database-enforced invariant:
-- an 'upload' row must carry all four upload fields and no
-- external_url; a 'link' row must carry external_url and none of the
-- four upload fields. This mirrors the existing mutual-exclusivity
-- CHECK pattern already used on public.semesters
-- (semesters_not_active_and_archived) — the database itself refuses a
-- row that mixes the two shapes, never relying on frontend validation
-- alone.
--
-- external_url has no URL-shape validation here on purpose — complex
-- URL parsing does not belong in a CHECK constraint; HTTPS-only
-- validation is application-level, added in a later stage.
--
-- file_size is bigint (byte count), not int4, to avoid any overflow
-- assumption about future file sizes. This migration does NOT encode
-- the product's 10 MB per-file limit or any Free/Pro total quota —
-- both belong in application code / Storage bucket configuration
-- later, so either can change without a migration.
-- ---------------------------------------------------------
create table if not exists public.subject_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  material_type text not null,
  title text not null,
  description text,
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  constraint subject_materials_material_type_valid
    check (material_type in ('link', 'upload')),

  constraint subject_materials_title_not_blank
    check (char_length(btrim(title)) > 0),

  constraint subject_materials_file_size_positive
    check (file_size is null or file_size > 0),

  constraint subject_materials_upload_or_link
    check (
      (material_type = 'upload'
        and storage_path is not null
        and file_name is not null
        and mime_type is not null
        and file_size is not null
        and external_url is null)
      or
      (material_type = 'link'
        and external_url is not null
        and storage_path is null
        and file_name is null
        and mime_type is null
        and file_size is null)
    ),

  -- Composite ownership FK: guarantees at the database level that a
  -- material's user_id can never disagree with its subject's actual
  -- owner — the identical defense-in-depth pattern subject_schedules
  -- already uses. This makes it structurally impossible for one user
  -- to attach a material to another user's subject, independent of RLS
  -- or any frontend check. This single composite FK also already
  -- guarantees subject_id references a real subjects.id row, so no
  -- separate/redundant plain FK on subject_id alone is added.
  --
  -- ON DELETE CASCADE: if a subject is ever deleted, its materials rows
  -- are deleted with it, matching the existing subject_schedules/
  -- activities/notes/grades behavior. IMPORTANT: this CASCADE only
  -- deletes the subject_materials database row — it cannot and does
  -- not delete the corresponding Supabase Storage object for an
  -- 'upload' row's file. Storage-object cleanup is a separate,
  -- not-yet-built concern for a later stage; until then, deleting a
  -- subject with uploaded materials can leave an orphaned Storage
  -- object with no referencing row. This is a known, deliberately
  -- deferred gap, not an oversight.
  constraint subject_materials_subject_owner_fk
    foreign key (user_id, subject_id) references public.subjects (user_id, id)
    on delete cascade
);

-- ---------------------------------------------------------
-- Tenant-aware composite index — RLS already filters every query by
-- user_id, so (user_id, subject_id) directly serves the real V1 access
-- pattern ("my materials for my subject"), matching the identical
-- indexing pattern already used on subjects/activities/notes/grades/
-- subject_schedules. A separate index for the future upload-bytes-sum
-- query (material_type = 'upload') is deliberately NOT added here —
-- that feature does not exist yet, expected per-user row counts are
-- small, and this composite index already supports a user_id-scoped
-- scan if/when that query is added in a later stage.
-- ---------------------------------------------------------
create index if not exists subject_materials_user_id_subject_id_idx
  on public.subject_materials (user_id, subject_id);

-- ---------------------------------------------------------
-- RLS — authenticated users only, strictly scoped to their own rows.
-- The composite ownership FK above is an additional, independent
-- database-level guarantee that user_id can never disagree with the
-- real owner of subject_id; RLS alone is not relied on for that —
-- identical reasoning to subject_schedules.
-- ---------------------------------------------------------
alter table public.subject_materials enable row level security;

create policy "subject_materials_select_own"
  on public.subject_materials for select
  to authenticated
  using (auth.uid() = user_id);

create policy "subject_materials_insert_own"
  on public.subject_materials for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "subject_materials_update_own"
  on public.subject_materials for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "subject_materials_delete_own"
  on public.subject_materials for delete
  to authenticated
  using (auth.uid() = user_id);
