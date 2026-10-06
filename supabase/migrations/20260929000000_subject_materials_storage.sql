-- =========================================================
-- Hybrid Lesson Materials #4: private Storage foundation for
-- subject_materials uploads.
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED.
--
-- Purpose: create the dedicated, PRIVATE "subject-materials" Supabase
-- Storage bucket and its minimum storage.objects RLS policies, so a
-- later stage can implement actual file uploads (PDF/JPG/JPEG/PNG)
-- against infrastructure that already exists and is already locked
-- down. This migration is infrastructure only — no upload function, no
-- signed-URL code, no quota logic, and no application code anywhere
-- reads or writes this bucket yet.
--
-- This migration is additive/isolated only:
--   - does NOT modify the existing "avatars" bucket, its policies, or
--     any other existing bucket in any way
--   - does NOT modify public.subject_materials, its columns, its
--     CHECK constraints, its own RLS, or its composite ownership FK —
--     that table already supports upload-row metadata in full from
--     Hybrid Materials #1, with zero changes needed here
--   - does NOT modify subjects/activities/notes/grades/semesters/
--     subject_schedules or any other existing table/column/FK/RLS/data
--   - does NOT touch Auth, PayMongo, Pro entitlement, reminders, Web
--     Push, the service worker, recurrence, or any semester RPC
--
-- Security model is defense in depth, not a single "authoritative"
-- layer — each layer below covers a different concern, and none of
-- them alone is relied upon for everything:
--   - bucket configuration (this file): rejects disallowed MIME types
--     and oversized files at the Storage service level, independent of
--     whatever a client claims
--   - storage.objects RLS (this file): restricts who may SELECT/
--     INSERT/DELETE which objects, based on the object path's owner
--     segment
--   - future client-side validation (a later stage): early, friendly
--     UX rejection of bad files before even attempting an upload —
--     never itself a security boundary
--   - public.subject_materials CHECK constraints/FK/RLS (already live
--     from Hybrid Materials #1): metadata integrity and subject
--     ownership for the DB row describing an uploaded file
-- No server/API layer is introduced or required for any of this —
-- the existing Supabase client + RLS + bucket-config model already
-- covers every requirement here.
--
-- Expected future object path (not generated or enforced by this
-- migration itself — written by a later stage's upload code):
--   {user_id}/{subject_id}/{uuid}.{ext}
-- Authorization below relies ONLY on the first path segment
-- (user_id) via (storage.foldername(name))[1] = auth.uid()::text.
-- The second segment (subject_id) is for human/debugging clarity only
-- — it is never treated as an authorization boundary here; real
-- subject-ownership enforcement already lives entirely in
-- public.subject_materials' own composite FK + RLS, a separate,
-- already-proven mechanism from Hybrid Materials #1.
--
-- No UPDATE policy is created, by design: the intended future model is
-- immutable objects (upload a new object -> update the
-- subject_materials row's metadata -> delete the old object) rather
-- than overwriting an existing object in place.
-- =========================================================

-- ---------------------------------------------------------
-- Bucket: created via INSERT ... ON CONFLICT so this migration is
-- safely re-runnable — it only ever touches the single row whose id
-- is 'subject-materials', updating exactly the three configuration
-- columns this stage cares about (public/file_size_limit/
-- allowed_mime_types) if the bucket already exists, and never
-- touching any other bucket (including "avatars").
--
-- file_size_limit is 10 MiB (10 * 1024 * 1024 = 10485760 bytes),
-- matching the product's 10 MB per-file target.
-- allowed_mime_types covers PDF, JPG/JPEG (both map to the single
-- MIME type image/jpeg — there is no separate image/jpg type), and
-- PNG — the only file types this product currently supports.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'subject-materials',
  'subject-materials',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------
-- storage.objects policies — authenticated users only, strictly
-- scoped to bucket_id = 'subject-materials' AND the object path's
-- first segment matching their own auth.uid(). DROP POLICY IF EXISTS
-- is used only for these exact, newly-introduced policy names (unique
-- to this bucket/feature) to make this migration safely re-runnable,
-- without touching any other existing policy on storage.objects
-- (including whatever policies already govern "avatars").
-- ---------------------------------------------------------

drop policy if exists "subject_materials_select_own" on storage.objects;
create policy "subject_materials_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'subject-materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "subject_materials_insert_own" on storage.objects;
create policy "subject_materials_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'subject-materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "subject_materials_delete_own" on storage.objects;
create policy "subject_materials_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'subject-materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No UPDATE policy — see the file header: objects are immutable by
-- design in the planned future upload/replace model.
