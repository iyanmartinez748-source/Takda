-- =========================================================
-- Hybrid Lesson Materials #8A: authoritative Free/Pro direct-upload
-- quota enforcement.
--
-- MIGRATION FILE ONLY AT CREATION TIME — NOT EXECUTED.
--
-- Purpose: make the account-wide direct-upload quota (Free 10 MiB /
-- Pro 50 MiB, currently-stored bytes) authoritative at the database
-- level, regardless of how an INSERT/UPDATE reaches
-- public.subject_materials — the existing app's own data layer, or a
-- technical user calling Supabase's REST API directly. Today's
-- subject_materials_insert_own / subject_materials_update_own RLS
-- policies only ever check row ownership; neither has any concept of
-- quota, so a client-side-only check (today's temporary universal
-- 25 MiB rail) can be bypassed entirely by any authenticated caller
-- who skips the app's own JS and posts straight to PostgREST.
--
-- This migration is additive/behavioral only:
--   - does NOT create any table or column
--   - does NOT create any RPC the client calls directly — both new
--     objects are passive triggers, never explicitly invoked
--   - does NOT change subject_materials_select_own,
--     subject_materials_insert_own, subject_materials_update_own, or
--     subject_materials_delete_own in any way
--   - does NOT change any Storage bucket or Storage policy
--   - does NOT modify profiles, pro_orders, or any PayMongo-related
--     table — profiles.plan / profiles.pro_until are read-only inputs
--     to the entitlement decision below, never written
--   - does NOT touch Auth, reminders, Web Push, the service worker,
--     recurrence, or any semester RPC
--   - does NOT change the temporary 25 MiB client-side safety rail in
--     src/lib/materialUploads.js — that remains the only ACTIVE
--     enforcement in Production until this migration is both applied
--     and the client is updated to consume it (a later, separate
--     stage) — see the deployment note at the end of this file
--
-- Security model is defense in depth, consistent with every prior
-- Hybrid Materials stage — no single layer here is "the" boundary:
--   - bucket configuration (#4): rejects disallowed MIME types and
--     oversized files for any REAL Storage upload, independent of
--     whatever a client claims
--   - storage.objects RLS (#4): restricts who may SELECT/INSERT/DELETE
--     which Storage objects, by path-owner segment
--   - subject_materials RLS (#1): restricts who may touch which
--     metadata rows, by ownership — already live, unchanged here
--   - THIS migration: the one layer that actually knows about
--     Free/Pro tiers and account-wide byte totals — closes the gap
--     every other layer above was never designed to cover
--
-- Two independent triggers, each with a narrow, single job:
--
--   1. subject_materials_upload_quota (BEFORE INSERT, upload rows
--      only): the authoritative "does this new upload fit" check —
--      entitlement resolved from profiles for auth.uid(), usage
--      summed live from subject_materials, a per-user advisory
--      transaction lock serializing concurrent same-user attempts.
--
--   2. subject_materials_upload_metadata_immutable (BEFORE UPDATE,
--      any row): closes a SEPARATE bypass discovered during review —
--      subject_materials_update_own's existing WITH CHECK only
--      verifies ownership, not WHICH columns change, so without this
--      trigger a caller could UPDATE an existing 'link' row into a
--      fabricated 'upload' row (smuggling an insert-equivalent past
--      trigger 1 entirely), or shrink an existing upload row's own
--      file_size to misrepresent how much Storage it actually
--      consumes. Making material_type / storage_path / file_name /
--      mime_type / file_size immutable after creation closes both
--      paths unconditionally, for every row, regardless of caller —
--      directly mirroring this project's own existing
--      reject_academic_semester_id_change() precedent. This also
--      requires no separate quota-recalculation logic for UPDATE at
--      all. Ordinary link editing (title / description / external_url
--      / updated_at) is completely untouched and keeps working exactly
--      as updateSubjectMaterialLink already relies on today.
--
-- Reviewed and found NOT to need further guarding (no new bypass):
--   - user_id: subject_materials_update_own's own WITH CHECK
--     (auth.uid() = user_id) already structurally forbids changing it
--     to any other value — a caller cannot reassign a row to
--     themselves from another user or vice versa via UPDATE
--   - subject_id: the existing composite ownership FK still applies to
--     UPDATE, so a row can only ever be reassigned among the SAME
--     user's own subjects; the quota usage query below has no subject
--     filter at all, so moving a material between one's own subjects
--     has zero effect on account-wide usage either way
--   - id: the primary key constraint alone prevents collisions; a
--     self-rename has no quota or cross-user security effect
--   - title / description / created_at / updated_at: no bearing on
--     quota or ownership
--
-- Concurrency: pg_advisory_xact_lock(hashtextextended(...)) is the
-- exact mechanism already proven live in this project's own
-- activate_semester() function (20260919000000_semester_write_
-- functions.sql) — hashtextextended is used there specifically because
-- plain hashtext() only yields a 32-bit int4 (higher collision odds),
-- while hashtextextended yields a genuine 64-bit bigint. Reused
-- verbatim here, not reinvented. Transaction-scoped: released
-- automatically on commit or rollback, no manual unlock, no risk of a
-- stuck lock outliving the call.
--
-- SECURITY INVOKER (both functions) — never SECURITY DEFINER,
-- consistent with every function this project has ever shipped
-- (update_semester_metadata / activate_semester / archive_semester /
-- the reminder_deliveries finalize functions). A function whose job IS
-- a security boundary should never be able to do MORE than the calling
-- role's own RLS already allows; DEFINER would require manually
-- re-deriving every ownership guarantee by hand and would run the
-- entire function body with elevated privilege if it ever had a bug.
-- profiles' own existing self-read RLS (auth.uid() = id, already relied
-- upon by the live client's own entitlement UI) and subject_materials'
-- own existing self-read RLS are both already sufficient for this
-- function to do its job under ordinary INVOKER semantics — no
-- privilege elevation is needed or used.
--
-- IMPORTANT DEPLOYMENT NOTE — do not apply this migration yet:
-- once applied to a live database, both triggers become immediately
-- active for EVERY insert/update, including those from the
-- currently-deployed client (which still enforces only the temporary
-- 25 MiB universal rail client-side). A Free-tier account between
-- 10 MiB and 25 MiB of existing usage would start having otherwise-
-- client-approved uploads rejected by trigger 1 the moment this
-- migration is applied — before any client code exists to recognize
-- or explain the new TKQT1/TKAU1/TKIN1 error codes. There is no way
-- for this specific kind of trigger to be "applied but inert." This
-- migration must stay un-applied to Production until the client
-- integration stage ships in the same coordinated release — exactly
-- matching this project's standing "migration file only at creation
-- time — not executed" convention already used for every prior Hybrid
-- Materials migration.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Quota enforcement: BEFORE INSERT, upload rows only.
-- ---------------------------------------------------------
create or replace function public.enforce_subject_material_upload_quota()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan text;
  v_pro_until timestamptz;
  v_limit bigint;
  v_usage bigint;
  v_remaining bigint;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.'
      using errcode = 'TKAU1';
  end if;

  -- Defense-in-depth beyond RLS: the row about to be inserted must
  -- already claim the caller's own identity. subject_materials_
  -- insert_own's WITH CHECK (auth.uid() = user_id) independently
  -- enforces the same thing; this makes the requirement explicit and
  -- self-contained inside the function too.
  if new.user_id is distinct from v_user_id then
    raise exception 'Cannot create a material for another user.'
      using errcode = 'TKAU1';
  end if;

  if new.file_size is null or new.file_size <= 0 then
    raise exception 'A valid file size is required.'
      using errcode = 'TKIN1';
  end if;

  -- Defense-in-depth only, same constant as the subject-materials
  -- Storage bucket's own file_size_limit (#4) — NOT a new product
  -- rule, and it can never diverge from the bucket/client validator
  -- since it is the identical literal. The bucket's own limit only
  -- ever applies to a REAL Storage upload; a bare metadata INSERT
  -- never itself proves a matching Storage object of this size
  -- actually exists, so this is re-asserted here independently.
  if new.file_size > 10485760 then
    raise exception 'File exceeds the maximum allowed size.'
      using errcode = 'TKIN1';
  end if;

  -- Serialize quota decisions for this one user only. Transaction-
  -- scoped (released automatically at commit/rollback); identical
  -- mechanism to activate_semester's own existing lock — see header.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select plan, pro_until
    into v_plan, v_pro_until
    from public.profiles
   where id = v_user_id;

  v_limit := case
    when lower(coalesce(v_plan, 'free')) = 'pro'
      and v_pro_until is not null
      and v_pro_until > now()
    then 52428800::bigint
    else 10485760::bigint
  end;

  select coalesce(sum(file_size), 0)
    into v_usage
    from public.subject_materials
   where user_id = v_user_id
     and material_type = 'upload';

  -- Overflow-safe by construction: never computes v_usage +
  -- NEW.file_size directly. If usage has already reached or passed
  -- the limit, every positive upload is rejected outright; otherwise
  -- "remaining" is a small, already-bounded positive bigint and the
  -- comparison can never overflow.
  if v_usage >= v_limit then
    raise exception 'Lesson file storage limit reached.'
      using errcode = 'TKQT1';
  end if;

  v_remaining := v_limit - v_usage;

  if new.file_size > v_remaining then
    raise exception 'Lesson file storage limit reached.'
      using errcode = 'TKQT1';
  end if;

  return new;
end;
$$;

drop trigger if exists subject_materials_upload_quota on public.subject_materials;
create trigger subject_materials_upload_quota
  before insert on public.subject_materials
  for each row
  when (new.material_type = 'upload')
  execute function public.enforce_subject_material_upload_quota();

-- ---------------------------------------------------------
-- 2. Upload identity/metadata immutability: BEFORE UPDATE, any row.
--
-- Not a quota calculation — closes the separate UPDATE-based bypass
-- described in the header above. Only fires when one of the five
-- guarded columns actually changes; ordinary link edits (title,
-- description, external_url, updated_at) never touch any of them and
-- are completely unaffected.
-- ---------------------------------------------------------
create or replace function public.reject_subject_material_upload_metadata_change()
returns trigger
language plpgsql
security invoker
as $$
begin
  raise exception 'Upload file metadata is immutable after creation.'
    using errcode = 'TKIN1';
end;
$$;

drop trigger if exists subject_materials_upload_metadata_immutable on public.subject_materials;
create trigger subject_materials_upload_metadata_immutable
  before update on public.subject_materials
  for each row
  when (
    old.material_type is distinct from new.material_type
    or old.storage_path  is distinct from new.storage_path
    or old.file_name     is distinct from new.file_name
    or old.mime_type     is distinct from new.mime_type
    or old.file_size     is distinct from new.file_size
  )
  execute function public.reject_subject_material_upload_metadata_change();
